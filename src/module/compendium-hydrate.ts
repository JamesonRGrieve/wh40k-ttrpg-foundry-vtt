/**
 * Runtime hydration of LEAN embedded inventory items.
 *
 * Both world actors and compendium (pack) actors store their inventory DRY (see
 * src/packs/CLAUDE.md): each embedded item carries only `_stats.compendiumSource`
 * (a UUID join key) plus the per-actor fields that genuinely belong to the actor
 * (`specialization`, `level`, equipped/quantity state, XP `cost`), or — for
 * quest-specific variants — `system.variantOf` pointing at the generic base plus
 * the variant name. The canonical item body lives ONCE, on the compendium item,
 * and is JOINED here at runtime, ALWAYS IN MEMORY and NEVER written back to the
 * database:
 *
 *  - **world boot** — `hooks-manager.ready()` hydrates every world actor;
 *  - **world import** — the `createActor` hook hydrates the new actor;
 *  - **rendering / pack browsing** — actor sheets hydrate before rendering.
 *
 * Every path calls {@link hydrateActorInMemory}, which uses `updateSource`
 * (re-coerces typed fields — Sets, nested DataModels — through the schema) +
 * `reset()`. `updateSource` mutates only the in-memory `_source`; the stored
 * record stays LEAN, so there is nothing on disk for a reload to clobber and a
 * compendium edit propagates to every actor on the next load with zero writes.
 *
 * The merge is "persisted wins": the canonical system body is the base layer and
 * everything the actor's item actually persists overlays it — so lean stubs gain
 * the full definition while their specialization/level/state/cost survive, and a
 * fully-hydrated item is a no-op (the join is idempotent).
 *
 * This REPLACED the old boot-time DB resync (`compendium-resync.ts`, deleted),
 * whose `updateEmbeddedDocuments` write reconciled the canonical body over the
 * stored record on every GM `ready` — and in doing so clobbered per-actor fields
 * (talent/power XP `cost`) back to the compendium's zero whenever a client ran
 * stale JS that predated the preserve-list fix. An in-memory join cannot clobber
 * because it never persists.
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
    items: { contents: HydratableItem[] };
    reset?: () => void;
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
            // eslint-disable-next-line no-await-in-loop -- sequential is intentional: the shared per-actor cache dedupes pack fetches across this actor's items
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

/**
 * Join the canonical compendium body onto an actor's LEAN items, ALWAYS IN
 * MEMORY: `updateSource` mutates each item's in-memory `_source` (re-coercing
 * typed fields — Sets, nested DataModels — through the schema; NO database
 * write, so the stored record stays lean and packs stay locked) and `reset()`
 * re-prepares the actor's derived data on top of the hydrated items.
 *
 * Works identically for world actors and pack actors — there is no DB-write
 * variant, by design (an in-memory join cannot clobber persisted per-actor
 * state, which is the whole point). Idempotent: an already-full item produces
 * no patch (`buildHydrationPatches` detects the no-op), so a second pass over a
 * hydrated actor returns 0 and skips the reset.
 */
export async function hydrateActorInMemory(actor: HydratableActor): Promise<number> {
    const patches = await buildHydrationPatches(actor);
    for (const patch of patches) {
        const item = actor.items.contents.find((i) => i.id === patch['_id']);
        item?.updateSource?.({ system: patch['system'], ...(patch['img'] !== undefined ? { img: patch['img'] } : {}) });
    }
    if (patches.length > 0) actor.reset?.();
    return patches.length;
}
