/**
 * Migration of the retired Deathwatch Distinction id lists (#171).
 *
 * Characters used to persist Distinctions and Marks of Distinction as two
 * opaque id arrays, `system.distinctions` and `system.marksOfDistinction`.
 * Distinctions and Marks are now `specialAbility` items (category
 * `distinction` / `mark`), conferred by dropping them on the sheet, so the
 * arrays are gone from the schema. This module turns any legacy entries in a
 * raw actor source into owned `specialAbility` item sources, so nothing a
 * Battle-Brother earned is dropped:
 *
 * - An entry that resolves to a compendium special ability (a full compendium
 *   UUID, or a name / name-slug / id matched against the loaded pack index)
 *   becomes a LEAN owned item: name, type, category and
 *   `_stats.compendiumSource`. The compendium join hydrates the rest.
 * - An entry that does not resolve stays visible as a special ability named
 *   after the raw entry, carrying the right category and a flag recording the
 *   original id, so the GM can reconcile it.
 *
 * An id in both lists is a Mark: the Mark list is the subset of earned
 * Distinctions crystallised as permanent Marks. Item ids are derived from the
 * entry, so re-running the migration on every load never duplicates an item.
 *
 * Pure: the caller supplies the catalogue lookup, built only when an actor
 * actually carries legacy entries. Called from `WH40KBaseActor.migrateData`.
 * The migration is in-memory, like every `migrateData` shape fix: the items
 * exist from the next load on, and are written to the world the next time the
 * world data is rewritten.
 */

import { SYSTEM_ID } from '../../constants.ts';

/** The flag recording the legacy list entry an owned special ability was migrated from. */
export const LEGACY_DISTINCTION_FLAG = 'legacyDistinction';

/** The retired id lists: every Distinction earned, and the subset crystallised as Marks. */
const LEGACY_LIST_KEYS = ['distinctions', 'marksOfDistinction'] as const;
type LegacyListKey = (typeof LEGACY_LIST_KEYS)[number];

type LegacyCategory = 'distinction' | 'mark';

/** A compendium special ability a legacy entry resolved to. */
export interface ResolvedSpecialAbility {
    uuid: string;
    name: string;
    img?: string | undefined;
}

/** Resolves one legacy entry against the special-ability catalogue; null when it matches nothing. */
export type SpecialAbilityLookup = (entry: string) => ResolvedSpecialAbility | null;

/** The owned item source a legacy entry becomes. */
export interface MigratedSpecialAbilitySource {
    _id: string;
    name: string;
    type: 'specialAbility';
    img?: string;
    system: { category: LegacyCategory };
    flags: Record<string, Record<string, string>>;
    _stats?: { compendiumSource: string };
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DOCUMENT_ID_LENGTH = 16;
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** A stable 16-character document id derived from a seed (FNV-1a, re-seeded per character). */
export function deterministicItemId(seed: string): string {
    let id = '';
    for (let i = 0; id.length < DOCUMENT_ID_LENGTH; i++) {
        let hash = FNV_OFFSET ^ i;
        for (const char of `${seed}#${i}`) {
            hash ^= char.charCodeAt(0);
            hash = Math.imul(hash, FNV_PRIME) >>> 0;
        }
        id += ID_ALPHABET[hash % ID_ALPHABET.length] ?? 'a';
    }
    return id;
}

/** Lowercase-hyphenated form of a name, as pack identifiers and file slugs are written. */
export function slugifyName(name: string): string {
    return name
        .toLowerCase()
        .replace(/['’]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** One compendium index entry, as the catalogue lookup sees it. */
export interface SpecialAbilityIndexEntry {
    _id: string;
    name: string;
    uuid: string;
    img?: string | undefined;
}

/** Build a lookup that matches an entry by compendium UUID, document id, name, or name slug. */
export function buildSpecialAbilityLookup(entries: Iterable<SpecialAbilityIndexEntry>): SpecialAbilityLookup {
    const byKey = new Map<string, ResolvedSpecialAbility>();
    for (const entry of entries) {
        const resolved = { uuid: entry.uuid, name: entry.name, img: entry.img };
        for (const key of [entry.uuid, entry._id, entry.name.toLowerCase(), slugifyName(entry.name)]) {
            if (!byKey.has(key)) byKey.set(key, resolved);
        }
    }
    return (entry) => byKey.get(entry) ?? byKey.get(entry.toLowerCase()) ?? byKey.get(slugifyName(entry)) ?? null;
}

/** The compendium surface the catalogue reader needs (structurally `game.packs`'s members). */
export interface SpecialAbilityPack {
    documentName: string;
    collection: string;
    index: { values: () => Iterable<{ _id: string; name?: string | undefined; type?: string | undefined; img?: string | null | undefined }> };
}

/**
 * Every special ability in the already-loaded Item pack indices. A pack whose
 * index is not loaded yet contributes nothing, and its entries fall through to
 * the unresolved-but-visible path.
 */
export function specialAbilityIndexEntries(packs: Iterable<SpecialAbilityPack>): SpecialAbilityIndexEntry[] {
    const out: SpecialAbilityIndexEntry[] = [];
    for (const pack of packs) {
        if (pack.documentName !== 'Item') continue;
        for (const row of pack.index.values()) {
            if (row.type !== 'specialAbility' || row.name === undefined) continue;
            out.push({ _id: row._id, name: row.name, uuid: `Compendium.${pack.collection}.Item.${row._id}`, img: row.img ?? undefined });
        }
    }
    return out;
}

const COMPENDIUM_ITEM_UUID = /^Compendium\.[^.]+\.[^.]+\.Item\.[A-Za-z0-9]+$/;

/** The non-blank string entries of one legacy list on a raw system payload. */
function legacyEntries(system: object, key: LegacyListKey): string[] {
    const distinctions = 'distinctions' in system ? system.distinctions : undefined;
    const marks = 'marksOfDistinction' in system ? system.marksOfDistinction : undefined;
    const value = key === 'distinctions' ? distinctions : marks;
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '').map((entry) => entry.trim());
}

/** The owned-item array of a raw actor source, created when absent. */
function ownedItemSources(actorSource: object): object[] {
    const existing = 'items' in actorSource ? actorSource.items : undefined;
    if (Array.isArray(existing)) return existing as object[];
    const created: object[] = [];
    Reflect.set(actorSource, 'items', created);
    return created;
}

function ownedItemId(item: object): string {
    return '_id' in item && typeof item._id === 'string' ? item._id : '';
}

/** The owned item source one legacy entry becomes. */
export function migratedSpecialAbility(entry: string, category: LegacyCategory, lookup: SpecialAbilityLookup): MigratedSpecialAbilitySource {
    const flags = { [SYSTEM_ID]: { [LEGACY_DISTINCTION_FLAG]: entry } };
    const _id = deterministicItemId(`legacy-distinction:${entry}`);
    const resolved = lookup(entry) ?? (COMPENDIUM_ITEM_UUID.test(entry) ? { uuid: entry, name: entry } : null);
    if (resolved === null) return { _id, name: entry, type: 'specialAbility', system: { category }, flags };
    return {
        _id,
        name: resolved.name,
        type: 'specialAbility',
        ...(resolved.img === undefined || resolved.img === '' ? {} : { img: resolved.img }),
        system: { category },
        flags,
        _stats: { compendiumSource: resolved.uuid },
    };
}

/**
 * Move a raw actor source's legacy Distinction lists into owned special-ability
 * item sources and delete the lists. Entries already migrated (an owned item
 * with the derived id) are skipped. Returns the number of items added.
 */
export function migrateLegacyDistinctionLists(actorSource: object, buildLookup: () => SpecialAbilityLookup): number {
    const system = 'system' in actorSource ? actorSource.system : undefined;
    if (typeof system !== 'object' || system === null || Array.isArray(system)) return 0;
    if (!LEGACY_LIST_KEYS.some((key) => key in system)) return 0;

    const marks = new Set(legacyEntries(system, 'marksOfDistinction'));
    const categories = new Map<string, LegacyCategory>();
    for (const entry of legacyEntries(system, 'distinctions')) categories.set(entry, marks.has(entry) ? 'mark' : 'distinction');
    for (const entry of marks) categories.set(entry, 'mark');
    for (const key of LEGACY_LIST_KEYS) Reflect.deleteProperty(system, key);
    if (categories.size === 0) return 0;

    const items = ownedItemSources(actorSource);
    const existingIds = new Set(items.map(ownedItemId));
    const lookup = buildLookup();
    let added = 0;
    for (const [entry, category] of categories) {
        const item = migratedSpecialAbility(entry, category, lookup);
        if (existingIds.has(item._id)) continue;
        items.push(item);
        existingIds.add(item._id);
        added++;
    }
    return added;
}
