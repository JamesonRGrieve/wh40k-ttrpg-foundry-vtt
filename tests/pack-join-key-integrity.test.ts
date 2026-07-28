/**
 * Regression guard (#499): every LEAN embedded item on a pack actor must have a
 * join key that resolves to a document that actually exists in the pack tree.
 *
 * Bug history: pack actors ship LEAN inventories (`src/packs/CLAUDE.md`) — each
 * embedded item carries `_stats.compendiumSource` (or `system.variantOf`) and no
 * `system` body. The canonical body is joined IN MEMORY at runtime. When that
 * join fails the item is left as a name with no mechanics — a weapon with no
 * damage formula — and the only trace was a `console.error`, so it read as
 * "authored without claws" rather than "the claws didn't load". A dangling join
 * key is therefore silent data loss, and this test is the pre-deploy check that
 * would have caught it.
 *
 * The check is static: the referenced pack must exist in the tree and contain a
 * document with the referenced id. It cannot catch a runtime failure (pack not
 * loaded on that client), which is why the runtime path also reports unresolved
 * joins to the GM — see `reportUnresolvedJoins` in `src/module/compendium-hydrate.ts`.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PACKS_ROOT = resolve(__dirname, '../src/packs');
/** `Compendium.<system>.<pack>.<DocType>.<id>` */
const UUID_RE = /^Compendium\.([^.]+)\.([^.]+)\.([^.]+)\.([^.]+)$/;

/** Recursively collect every `_source/*.json` file under a directory. */
function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            out.push(...sourceFiles(full));
        } else if (entry.endsWith('.json') && basename(dir) === '_source') {
            out.push(full);
        }
    }
    return out;
}

interface EmbeddedItem {
    name?: string;
    _stats?: { compendiumSource?: string | null };
    system?: { variantOf?: string | null };
}

interface PackDoc {
    _id?: string;
    name?: string;
    items?: EmbeddedItem[];
    /** One-key cross-line pointer at the canonical document (see gulpfile `isReferenceStub`). */
    reference?: string;
}

const files = existsSync(PACKS_ROOT) ? sourceFiles(PACKS_ROOT) : [];

/**
 * Mirror of the gulpfile's `resolvePackSourceDocument`: a `reference` stub
 * compiles to its TARGET document, so the id the pack publishes is the target's
 * `_id`, not anything derivable from the stub's own filename.
 * @param {string} file  Absolute path to a `_source/*.json` document.
 * @param {Set<string>} seen  Cycle guard.
 * @returns {PackDoc | null}  The resolved document, or null when unreadable.
 */
function resolveDoc(file: string, seen = new Set<string>()): PackDoc | null {
    if (seen.has(file)) return null;
    seen.add(file);
    let doc: PackDoc;
    try {
        doc = JSON.parse(readFileSync(file, 'utf8')) as PackDoc;
    } catch {
        return null;
    }
    if (typeof doc.reference !== 'string') return doc;
    const target = doc.reference.startsWith('packs/') ? resolve(PACKS_ROOT, doc.reference.slice('packs/'.length)) : resolve(file, '..', doc.reference);
    if (!existsSync(target)) return null;
    const resolved = resolveDoc(target, seen);
    if (resolved === null) return null;
    // Per-line override keys (e.g. `img`) win over the canonical body.
    const { reference: _reference, ...overrides } = doc;
    return { ...resolved, ...overrides };
}

/** packName -> set of document ids it contains. */
const packIds = new Map<string, Set<string>>();
/** All actor documents that embed items, keyed by their file. */
const actors: Array<{ file: string; doc: PackDoc }> = [];

for (const file of files) {
    const doc = resolveDoc(file);
    if (doc === null) continue; // malformed / dead stub — the pack-schema validator's job
    // .../<line>/<pack-name>/_source/<file>.json
    const packName = basename(resolve(file, '../..'));
    const ids = packIds.get(packName) ?? new Set<string>();
    // The pack build keys each document by the RESOLVED doc's `_id`
    // (gulpfile: `!${collectionType}!${doc._id}`), so that is the id a
    // `Compendium.…` UUID has to match.
    if (typeof doc._id === 'string' && doc._id !== '') ids.add(doc._id);
    packIds.set(packName, ids);
    if (Array.isArray(doc.items) && doc.items.length > 0) actors.push({ file, doc });
}

/** Every join key on every embedded item, with enough context to name it. */
function joinKeys(): Array<{ file: string; actor: string; item: string; uuid: string }> {
    const out: Array<{ file: string; actor: string; item: string; uuid: string }> = [];
    for (const { file, doc } of actors) {
        for (const item of doc.items ?? []) {
            for (const uuid of [item._stats?.compendiumSource, item.system?.variantOf]) {
                if (typeof uuid === 'string' && uuid.startsWith('Compendium.')) {
                    out.push({ file, actor: doc.name ?? basename(file), item: item.name ?? '<unnamed>', uuid });
                }
            }
        }
    }
    return out;
}

describe('pack embedded-item join keys resolve (#499)', () => {
    it('finds pack source documents to check', () => {
        expect(files.length).toBeGreaterThan(0);
        expect(actors.length).toBeGreaterThan(0);
    });

    it('every compendiumSource / variantOf points at a pack that exists in the tree', () => {
        const dangling = joinKeys().filter(({ uuid }) => {
            const m = UUID_RE.exec(uuid);
            if (m === null) return true; // malformed UUID can never resolve
            return !packIds.has(m[2] ?? '');
        });
        expect(dangling.map((d) => `${d.actor} → ${d.item}: ${d.uuid}`)).toEqual([]);
    });

    it('every compendiumSource / variantOf points at a document id that exists in that pack', () => {
        const dangling = joinKeys().filter(({ uuid }) => {
            const m = UUID_RE.exec(uuid);
            if (m === null) return false; // covered by the pack-existence assertion above
            const ids = packIds.get(m[2] ?? '');
            if (ids === undefined) return false; // ditto
            return !ids.has(m[4] ?? '');
        });
        expect(dangling.map((d) => `${d.actor} → ${d.item}: ${d.uuid}`)).toEqual([]);
    });
});
