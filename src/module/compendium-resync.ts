import { SYSTEM_ID } from './constants.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

/**
 * Per-item-type list of dot-paths under `system` that belong to the actor
 * (state) and must NOT be overwritten when reconciling against the compendium
 * source. Everything not listed here is treated as "definition" and gets
 * synced on every world boot.
 *
 * Add a key here if you discover that a per-actor field is being clobbered.
 */
const RUNTIME_PRESERVE_PATHS: Record<string, ReadonlyArray<string>> = {
    skill: ['advance', 'specializations', 'bonus'],
    weapon: ['clip', 'equipped', 'stowed', 'jammed', 'modifications'],
    armour: ['equipped', 'damageTaken', 'modifications'],
    ammunition: ['quantity', 'equipped'],
    gear: ['quantity', 'equipped', 'stowed', 'uses'],
    consumable: ['quantity', 'uses'],
    cybernetic: ['installed'],
    talent: [],
    trait: [],
    'psychic-power': [],
};

const FROZEN_FLAG = 'frozenFromCompendium';

/**
 * Item types that are inherently per-actor (not compendium-sourced) and should
 * be skipped without warning. `journalEntry` is the wh40k-rpg in-character
 * notes attached to actor sheets — there is no compendium equivalent.
 */
const SKIP_TYPES = new Set(['journalEntry']);

/** Names that mark unconfigured stub items the GM hasn't filled out yet. */
const STUB_NAMES = new Set(['New Talent', 'New JournalEntry', 'New Item']);

/**
 * Map an actor's `system.gameSystem` value to the pack-name prefix used by the
 * compendium packs. Actor docs use the edition-suffixed variant (e.g. `dh2e`)
 * but the packs were authored without it (`dh2-core-stats-skills`). Strip a
 * trailing `e` to bridge the two; everything else passes through.
 */
function gameSystemPackPrefix(gameSystem: string): string {
    if (gameSystem === 'dh1e') return 'dh1';
    if (gameSystem === 'dh2e') return 'dh2';
    return gameSystem;
}

/** Strip ` (specialization)` suffix from an item name for fallback matching. */
function stripSpecialization(name: string): string {
    return name.replace(/\s*\([^)]*\)\s*$/u, '').trim();
}

type CompendiumStats = { compendiumSource?: string | null };

type EmbeddedItemLike = {
    id: string | null;
    name: string | null;
    img: string | null;
    type: string;
    system: Record<string, unknown>;
    flags?: Record<string, Record<string, unknown> | undefined>;
    _stats?: CompendiumStats;
};

type ActorLike = {
    name: string | null;
    system?: { gameSystem?: string };
    items: { contents: EmbeddedItemLike[] };
    updateEmbeddedDocuments: (
        type: 'Item',
        updates: Array<Record<string, unknown>>,
    ) => Promise<unknown>;
};

type IndexEntry = { _id: string; type: string; name: string };

type PackLike = {
    metadata: { id: string; name: string; type: string };
    getIndex: (options?: { fields?: string[] }) => Promise<IndexEntry[]>;
};

declare const fromUuid: (uuid: string) => Promise<EmbeddedItemLike | null>;

function getProperty(obj: unknown, path: string): unknown {
    return foundry.utils.getProperty(obj as object, path);
}

function setProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
    foundry.utils.setProperty(obj, path, value);
}

function buildLookupKey(type: string, name: string): string {
    return `${type}|${name.trim().toLowerCase()}`;
}

/**
 * Build a per-gameSystem `(type|name) → compendium UUID` map by enumerating
 * every Item pack whose name starts with `<gameSystem>-`. Cached across actors.
 */
async function getNameIndexFor(
    gameSystem: string,
    cache: Map<string, Map<string, string>>,
): Promise<Map<string, string>> {
    const cached = cache.get(gameSystem);
    if (cached) return cached;

    const lookup = new Map<string, string>();
    const prefix = `${gameSystemPackPrefix(gameSystem)}-`;
    const packs = (game.packs?.contents ?? []) as PackLike[];

    for (const pack of packs) {
        if (pack.metadata.type !== 'Item') continue;
        if (!pack.metadata.name.startsWith(prefix)) continue;
        const index = await pack.getIndex({ fields: ['type', 'name'] });
        for (const entry of index) {
            const key = buildLookupKey(entry.type, entry.name);
            if (!lookup.has(key)) {
                lookup.set(key, `Compendium.${pack.metadata.id}.Item.${entry._id}`);
            }
        }
    }

    cache.set(gameSystem, lookup);
    return lookup;
}

/**
 * Build the patch to bring `embedded` into line with `source`, preserving the
 * runtime paths declared for this item type. Returns `null` if nothing would
 * change.
 */
function buildResyncPatch(
    embedded: EmbeddedItemLike,
    source: EmbeddedItemLike,
): Record<string, unknown> | null {
    const preserve = RUNTIME_PRESERVE_PATHS[embedded.type] ?? [];
    const newSystem = foundry.utils.deepClone(source.system) as Record<string, unknown>;

    for (const path of preserve) {
        const current = getProperty(embedded.system, path);
        if (current !== undefined) {
            setProperty(newSystem, path, current);
        }
    }

    const beforeKey = JSON.stringify({
        name: embedded.name,
        img: embedded.img,
        system: embedded.system,
    });
    const afterKey = JSON.stringify({
        name: source.name,
        img: source.img,
        system: newSystem,
    });
    if (beforeKey === afterKey) return null;

    return {
        _id: embedded.id,
        name: source.name,
        img: source.img,
        system: newSystem,
    };
}

function isFrozen(item: EmbeddedItemLike): boolean {
    return Boolean(item.flags?.[SYSTEM_ID]?.[FROZEN_FLAG]);
}

function compendiumSourceUuid(item: EmbeddedItemLike): string | null {
    const stats = item._stats as CompendiumStats | undefined;
    return stats?.compendiumSource ?? null;
}

/**
 * Reconcile every embedded item on every world actor with its compendium
 * source. GM-only, gated by the `resyncOnReady` setting. Idempotent.
 *
 * Source resolution order per item:
 *   1. `_stats.compendiumSource` UUID — direct lookup.
 *   2. Name match in any Item pack whose name starts with the actor's
 *      `system.gameSystem` (e.g. "dh2-*" for a DH2e actor). When matched this
 *      way, `_stats.compendiumSource` is backfilled so subsequent boots take
 *      path (1).
 *
 * Items with no resolved source are warned about and left alone, as are items
 * flagged `flags.wh40k-rpg.frozenFromCompendium`.
 */
export async function resyncWorldFromCompendiums(): Promise<void> {
    if (!game.user.isGM) return;
    const enabled = game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.resyncOnReady);
    if (enabled === false) return;

    const actors = (game.actors?.contents ?? []) as ActorLike[];
    const sourceByUuid = new Map<string, EmbeddedItemLike | null>();
    const indexByGameSystem = new Map<string, Map<string, string>>();
    const warnedKeys = new Set<string>();

    let actorsTouched = 0;
    let itemsTouched = 0;
    let itemsBackfilled = 0;
    let itemsSkippedFrozen = 0;
    let itemsUnresolved = 0;

    for (const actor of actors) {
        const gameSystem = actor.system?.gameSystem;
        const updates: Array<Record<string, unknown>> = [];

        for (const item of actor.items.contents) {
            if (isFrozen(item)) {
                itemsSkippedFrozen += 1;
                continue;
            }
            if (SKIP_TYPES.has(item.type)) continue;
            if (item.name && STUB_NAMES.has(item.name)) continue;

            let uuid = compendiumSourceUuid(item);
            let source: EmbeddedItemLike | null = null;
            let backfillNeeded = false;

            if (uuid) {
                let cached = sourceByUuid.get(uuid);
                if (cached === undefined) {
                    cached = await fromUuid(uuid);
                    sourceByUuid.set(uuid, cached);
                }
                source = cached;
            } else if (gameSystem) {
                const index = await getNameIndexFor(gameSystem, indexByGameSystem);
                const rawName = item.name ?? '';
                // Try the full name first; on miss, fall back to the bare name
                // with any ` (specialization)` suffix stripped. Specialist
                // talents and lore skills carry the specialization on the
                // instance, while the compendium has the base entry with an
                // empty `specializations[]` — that picks gets preserved by
                // RUNTIME_PRESERVE_PATHS.
                const candidate =
                    index.get(buildLookupKey(item.type, rawName)) ??
                    index.get(buildLookupKey(item.type, stripSpecialization(rawName)));
                if (candidate) {
                    let cached = sourceByUuid.get(candidate);
                    if (cached === undefined) {
                        cached = await fromUuid(candidate);
                        sourceByUuid.set(candidate, cached);
                    }
                    if (cached) {
                        uuid = candidate;
                        source = cached;
                        backfillNeeded = true;
                    }
                }
            }

            if (!source) {
                const key = `${gameSystem ?? '?'}|${item.type}|${item.name ?? '?'}`;
                if (!warnedKeys.has(key)) {
                    warnedKeys.add(key);
                    // eslint-disable-next-line no-console
                    console.warn(
                        `[wh40k-rpg] compendium resync: no source for ${item.type} "${item.name}" ` +
                            `on actor "${actor.name}" (gameSystem=${gameSystem ?? 'unknown'})`,
                    );
                }
                itemsUnresolved += 1;
                continue;
            }

            const patch = buildResyncPatch(item, source);
            if (!patch && !backfillNeeded) continue;

            const finalPatch: Record<string, unknown> = patch ?? { _id: item.id };
            if (backfillNeeded && uuid) {
                setProperty(finalPatch, '_stats.compendiumSource', uuid);
                itemsBackfilled += 1;
            }
            updates.push(finalPatch);
        }

        if (updates.length > 0) {
            await actor.updateEmbeddedDocuments('Item', updates);
            actorsTouched += 1;
            itemsTouched += updates.length;
        }
    }

    // eslint-disable-next-line no-console
    console.log(
        `[wh40k-rpg] compendium resync: ${itemsTouched} updated across ${actorsTouched} actor(s)` +
            (itemsBackfilled > 0 ? `, ${itemsBackfilled} backfilled` : '') +
            (itemsSkippedFrozen > 0 ? `, ${itemsSkippedFrozen} frozen` : '') +
            (itemsUnresolved > 0 ? `, ${itemsUnresolved} unresolved (see warnings)` : ''),
    );
}
