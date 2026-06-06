import { SYSTEM_ID } from './constants.ts';

/**
 * Runtime hydration of LEAN embedded inventory items.
 *
 * Compendium actors store their inventory DRY (see src/packs/CLAUDE.md): each
 * embedded item carries only `_stats.compendiumSource` (a UUID join key) plus the
 * per-actor fields that genuinely belong to the actor (`specialization`, `level`,
 * equipped/quantity state), or — for quest-specific variants — `system.variantOf`
 * pointing at the generic base plus the variant name. The canonical item data
 * lives once, on the compendium item, and is JOINED here at runtime:
 *
 *  - **world import** — the `createActor` hook hydrates immediately (the boot
 *    resync would otherwise catch it at next load);
 *  - **world boot** — `resyncWorldFromCompendiums` (compendium-resync.ts) keeps
 *    world actors reconciled against compendium edits;
 *  - **compendium browsing** — actor sheets hydrate the pack document IN MEMORY
 *    (`updateSource`, no database write; packs stay locked) before rendering.
 *
 * The merge is "persisted wins": the canonical system data is the base layer and
 * everything the actor's item actually persists overlays it — so lean stubs gain
 * the full definition while their specialization/level/state survive, and a
 * fully-written item is a no-op (the join is idempotent).
 */

/* eslint-disable no-restricted-syntax -- boundary: Foundry item/actor types carry open-ended Record<string,unknown> at framework boundaries */
type HydratableItem = {
    id: string | null;
    name: string | null;
    img: string | null;
    type: string;
    system: Record<string, unknown>;
    _source?: { system?: Record<string, unknown>; img?: string | null };
    _stats?: { compendiumSource?: string | null };
    updateSource?: (changes: Record<string, unknown>) => void;
};

type HydratableActor = {
    pack?: string | null;
    items: { contents: HydratableItem[] };
    reset?: () => void;
    updateEmbeddedDocuments?: (type: 'Item', updates: Array<Record<string, unknown>>) => Promise<unknown>;
};

type SourceLike = { img: string | null; system: Record<string, unknown> };
/* eslint-enable no-restricted-syntax */

// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry item system payloads are open-ended Records
function variantOfUuid(system: Record<string, unknown>): string | null {
    const variantOf = system['variantOf'];
    return typeof variantOf === 'string' && variantOf !== '' ? variantOf : null;
}

// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over untyped Foundry system payloads
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/* eslint-disable no-restricted-syntax -- boundary: Foundry system payloads are open-ended Records throughout the join */
function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        const current = out[key];
        out[key] = isPlainObject(current) && isPlainObject(value) ? deepMerge(current, value) : value;
    }
    return out;
}

/**
 * Pure join: canonical source system as the base layer, the item's PERSISTED
 * system overlaid on top (per-actor specialization/level/state/variantOf win).
 * No foundry-global dependency — unit-testable (cf. item-variant-utils' shim).
 */
export function buildHydratedSystem(sourceSystem: Record<string, unknown>, persistedSystem: Record<string, unknown>): Record<string, unknown> {
    return deepMerge(structuredClone(sourceSystem), persistedSystem);
}
/* eslint-enable no-restricted-syntax */

/** The join key for one item: its compendium source, or its variant base. */
function joinUuid(item: HydratableItem): string | null {
    return item._stats?.compendiumSource ?? variantOfUuid(item.system);
}

/**
 * Build the per-item hydration patches for an actor. Items with neither a
 * `compendiumSource` nor a `variantOf` are left alone (they are self-contained).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: patches are Foundry updateEmbeddedDocuments payloads
export async function buildHydrationPatches(actor: HydratableActor): Promise<Array<Record<string, unknown>>> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payloads are open-ended Records
    const patches: Array<Record<string, unknown>> = [];
    const cache = new Map<string, SourceLike | null>();

    for (const item of actor.items.contents) {
        const uuid = joinUuid(item);
        if (uuid === null || item.id === null) continue;

        let source = cache.get(uuid);
        if (source === undefined) {
            // eslint-disable-next-line no-await-in-loop -- sequential is intentional: the shared cache dedupes pack fetches (same pattern as compendium-resync)
            source = (await fromUuid(uuid)) as SourceLike | null;
            cache.set(uuid, source);
        }
        if (source === null) continue;

        const persisted = item._source?.system ?? item.system;
        const merged = buildHydratedSystem(source.system, persisted);
        if (JSON.stringify(merged) === JSON.stringify(persisted)) continue; // already full — no-op

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payload
        const patch: Record<string, unknown> = { _id: item.id, system: merged };
        if ((item._source?.img ?? item.img) === null && source.img !== null) patch['img'] = source.img;
        patches.push(patch);
    }
    return patches;
}

/** Hydrate a WORLD actor's lean items (persists via updateEmbeddedDocuments). */
export async function hydrateWorldActor(actor: HydratableActor): Promise<number> {
    if (actor.pack != null && actor.pack !== '') return 0;
    const patches = await buildHydrationPatches(actor);
    if (patches.length > 0 && actor.updateEmbeddedDocuments) {
        try {
            await actor.updateEmbeddedDocuments('Item', patches);
        } catch (err) {
            console.warn(`[${SYSTEM_ID}] compendium hydrate: updateEmbeddedDocuments failed; items stay lean until the next resync.`, err);
            return 0;
        }
    }
    return patches.length;
}

/**
 * Hydrate a PACK actor in memory for display: `updateSource` mutates the cached
 * document's source (no database write — the pack stays locked) and `reset()`
 * re-prepares derived data. Idempotent: a second render finds full items.
 */
export async function hydratePackActor(actor: HydratableActor): Promise<number> {
    if (actor.pack == null || actor.pack === '') return 0;
    const patches = await buildHydrationPatches(actor);
    for (const patch of patches) {
        const item = actor.items.contents.find((i) => i.id === patch['_id']);
        item?.updateSource?.({ system: patch['system'], ...(patch['img'] !== undefined ? { img: patch['img'] } : {}) });
    }
    if (patches.length > 0) actor.reset?.();
    return patches.length;
}
