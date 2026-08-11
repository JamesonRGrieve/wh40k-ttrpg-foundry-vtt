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
    /** Identity used only to report an unresolved join to the GM (#499). */
    name?: string | null;
    uuid?: string | null;
    id?: string | null;
    img?: string | null;
    _stats?: { compendiumSource?: string | null };
    /**
     * The actor's OWN system payload. A named individual authored as a
     * `variantOf` an unnamed class joins its base through this, exactly as an
     * embedded item joins its compendium source.
     */
    system?: Record<string, unknown>;
    _source?: { system?: Record<string, unknown> };
    updateSource?: (changes: Record<string, unknown>) => void;
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
 * How many `variantOf` hops to follow before giving up.
 *
 * A variant may itself be a variant (a named ship of a pattern of a class), so
 * the walk is a chain rather than a single hop — but authored data can also
 * contain a cycle, and this join runs on a hot prep/render path. The bound makes
 * a malformed chain a logged warning instead of a hang.
 */
const MAX_VARIANT_DEPTH = 8;

/**
 * Order-insensitive structural comparison, for "did the join actually change
 * anything".
 *
 * A plain `JSON.stringify` comparison is key-order sensitive, and the merge
 * necessarily reorders: the base's keys land first. Comparing raw strings would
 * therefore report a change on every variant actor whose values already match
 * its base, patch it needlessly, and `reset()` it on every render.
 */
/* eslint-disable no-restricted-syntax -- boundary: compares two untyped Foundry system payloads, which are `unknown` at every depth by construction */
function sameSystem(a: unknown, b: unknown): boolean {
    if (isPlainObject(a) && isPlainObject(b)) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        return [...keys].every((key) => sameSystem(a[key], b[key]));
    }
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((value, index) => sameSystem(value, b[index]));
    }
    return a === b;
}
/* eslint-enable no-restricted-syntax */

/**
 * Resolve an actor's `variantOf` chain into the base system layers to sit UNDER
 * its own values, nearest base first.
 *
 * Mirrors the item join: a named individual (the *Excrucian*) stores only what
 * makes it that individual and points at the unnamed class it instances (the
 * Devastation-class Cruiser), which holds the stats once. See
 * src/packs/CLAUDE.md "Actor atomization".
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry system payloads are open-ended Records in and out
async function resolveVariantChain(system: Record<string, unknown>, unresolved: UnresolvedJoin[], actorName: string): Promise<Array<Record<string, unknown>>> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry system payloads are open-ended Records
    const layers: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();
    let uuid = variantOfUuid(system);

    while (uuid !== null && layers.length < MAX_VARIANT_DEPTH) {
        if (seen.has(uuid)) {
            console.warn(`compendium-hydrate: variantOf cycle at ${uuid} on ${actorName}; stopping the walk`);
            break;
        }
        seen.add(uuid);

        let base: SourceLike | null;
        try {
            // eslint-disable-next-line no-await-in-loop -- sequential by nature: each hop's uuid comes from the previous base
            base = (await fromUuid(uuid)) as SourceLike | null;
        } catch (err) {
            // Same contract as the item join: best-effort enrichment must never
            // throw on a render path. The actor keeps its own values.
            console.warn(`compendium-hydrate: could not resolve base actor ${uuid}; leaving actor unjoined`, err);
            base = null;
        }
        if (base === null || !isPlainObject(base.system)) {
            unresolved.push({ itemName: actorName, uuid });
            break;
        }
        layers.push(base.system);
        uuid = variantOfUuid(base.system);
    }
    return layers;
}

/**
 * The actor's own hydrated system: every base in its `variantOf` chain stacked
 * furthest-first, with the actor's PERSISTED system last so its own values win.
 * Returns `null` when the actor is its own base or nothing resolved — callers
 * skip the patch entirely rather than writing an identical payload.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry system payloads are open-ended Records
async function buildActorSystemPatch(actor: HydratableActor, unresolved: UnresolvedJoin[]): Promise<Record<string, unknown> | null> {
    const persisted = actor._source?.system ?? actor.system;
    if (!isPlainObject(persisted) || variantOfUuid(persisted) === null) return null;

    const layers = await resolveVariantChain(persisted, unresolved, actor.name ?? 'Unknown actor');
    if (layers.length === 0) return null;

    // Furthest ancestor first, so a nearer base overrides it and the actor's own
    // values override everything — the item join's "persisted wins" contract.
    let merged = structuredClone(layers[layers.length - 1] ?? {});
    for (let i = layers.length - 2; i >= 0; i -= 1) merged = deepMerge(merged, layers[i] ?? {});
    merged = deepMerge(merged, persisted);

    return sameSystem(merged, persisted) ? null : merged;
}

/** Actors already reported this session, so a re-render doesn't re-nag the GM. */
const reportedUnresolved = new Set<string>();

/**
 * Surface unresolved lean-stub joins to the GM once per actor per session.
 *
 * #499: the only trace of a failed join used to be a `console.error`, so a
 * genestealer hybrid whose Tyranid Rending Claws didn't hydrate simply read as
 * an NPC authored without claws. A notification naming the actor and the items
 * makes "didn't load" distinguishable from "isn't there".
 * @param {string} actorName  Actor the join belongs to, for the message.
 * @param {string} actorKey   Stable de-dupe key (actor uuid or id).
 * @param {UnresolvedJoin[]} unresolved  The items that stayed lean.
 */
function reportUnresolvedJoins(actorName: string, actorKey: string, unresolved: UnresolvedJoin[]): void {
    if (unresolved.length === 0 || reportedUnresolved.has(actorKey)) return;
    reportedUnresolved.add(actorKey);
    const items = unresolved.map((u) => `${u.itemName} (${u.uuid})`).join(', ');
    console.error(`compendium-hydrate: ${actorName} has ${unresolved.length} unresolved join key(s): ${items}`);
    // Only a booted client has `ui`/`game`; the same code runs under vitest and
    // in headless pack tooling, where the console line above is the whole report.
    if (typeof ui === 'undefined' || typeof game === 'undefined') return;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `ui.notifications` is undefined until Foundry's `setup` phase
    ui.notifications?.warn(
        game.i18n.format('WH40K.Warning.HydrationFailed', {
            actor: actorName,
            count: String(unresolved.length),
            items,
        }),
    );
}

/** An embedded item whose join key did not resolve — it stayed a lean husk. */
interface UnresolvedJoin {
    /** The item's display name, for a GM-facing message. */
    itemName: string;
    /** The join key that failed to resolve. */
    uuid: string;
}

/** Outcome of a hydration pass over one actor. */
interface HydrationResult {
    /** Patches produced (0 when every item was already full). */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payloads are open-ended Records
    patches: Array<Record<string, unknown>>;
    /**
     * Items whose canonical body could NOT be joined. These stay lean — a
     * weapon with no damage formula, a talent with no rules text — so the
     * failure MUST be surfaced rather than left to read as "authored without
     * claws" (#499).
     */
    unresolved: UnresolvedJoin[];
    /**
     * The actor's OWN joined system when it is a `variantOf` some base class,
     * else `null`. Separate from `patches`, which are embedded-item payloads.
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry system payloads are open-ended Records
    actorSystem: Record<string, unknown> | null;
}

/**
 * Build the per-item hydration patches for an actor, its own variant-chain
 * join, and the list of join keys that did not resolve. Items with neither a
 * `compendiumSource` nor a `variantOf` are left alone (they are self-contained),
 * as is an actor that is its own base.
 */
async function buildHydration(actor: HydratableActor): Promise<HydrationResult> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payloads are open-ended Records
    const patches: Array<Record<string, unknown>> = [];
    const unresolved: UnresolvedJoin[] = [];
    const cache = new Map<string, SourceLike | null>();

    for (const item of actor.items.contents) {
        const uuid = joinUuid(item);
        if (uuid === null || item.id === null) continue;

        let source = cache.get(uuid);
        if (source === undefined) {
            try {
                // eslint-disable-next-line no-await-in-loop -- sequential is intentional: the shared per-actor cache dedupes pack fetches across this actor's items
                source = (await fromUuid(uuid)) as SourceLike | null;
            } catch (err) {
                // The join is best-effort enrichment on a hot prep/render path. A
                // compendium ref that can't resolve (pack not loaded, renamed, or a
                // not-yet-ready documentClass) must NOT throw: it would surface as an
                // unhandled rejection (the `createActor` hook voids this promise) or
                // crash the sheet render. Skip the item — it stays its lean self.
                console.warn(`compendium-hydrate: could not resolve ${uuid}; leaving item lean`, err);
                source = null;
            }
            cache.set(uuid, source);
        }
        if (source === null) {
            // A null result from `fromUuid` is the same failure as a throw: the
            // canonical body is unreachable and the item keeps only its join key.
            unresolved.push({ itemName: item.name ?? uuid, uuid });
            continue;
        }

        const persisted = item._source?.system ?? item.system;
        const merged = buildHydratedSystem(source.system, persisted);
        if (JSON.stringify(merged) === JSON.stringify(persisted)) continue; // already full — no-op

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payload
        const patch: Record<string, unknown> = { _id: item.id, system: merged };
        const persistedImg = item._source?.img ?? item.img;
        if (source.img !== null && persistedImg !== source.img) patch['img'] = source.img;
        patches.push(patch);
    }
    const actorSystem = await buildActorSystemPatch(actor, unresolved);
    return { patches, unresolved, actorSystem };
}

/**
 * Patches-only view of {@link buildHydration}, kept as the narrow surface most
 * callers (and the resilience tests) want.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: patches are Foundry updateEmbeddedDocuments payloads
export async function buildHydrationPatches(actor: HydratableActor): Promise<Array<Record<string, unknown>>> {
    return (await buildHydration(actor)).patches;
}

/**
 * The actor's own variant-chain join, as the narrow surface for tests and for
 * callers that want the joined system without applying it.
 *
 * `null` when the actor is its own base, when nothing resolved, or when the join
 * would be a no-op.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry system payloads are open-ended Records
export async function buildActorVariantJoin(actor: HydratableActor): Promise<Record<string, unknown> | null> {
    return buildActorSystemPatch(actor, []);
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
    return (await hydrateActorReporting(actor)).patched;
}

/**
 * As {@link hydrateActorInMemory}, but also reports the join keys that did not
 * resolve so the caller can surface them. A silent drop is what made #499 read
 * as "the hybrid was authored without claws" instead of "the claws didn't load".
 */
async function hydrateActorReporting(actor: HydratableActor): Promise<{ patched: number; unresolved: UnresolvedJoin[] }> {
    const { patches, unresolved, actorSystem } = await buildHydration(actor);
    for (const patch of patches) {
        const item = actor.items.contents.find((i) => i.id === patch['_id']);
        item?.updateSource?.({ system: patch['system'], ...(patch['img'] !== undefined ? { img: patch['img'] } : {}) });
    }
    // The actor's own join, same in-memory contract as its items': `updateSource`
    // touches only `_source`, so a named individual gains its class's stats at
    // load while the stored record keeps just what makes it that individual.
    // Sync the actor's own img from its compendium source (#558)
    const actorSourceUuid = actor._stats?.compendiumSource;
    if (typeof actorSourceUuid === 'string' && actorSourceUuid !== '') {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: fromUuid returns an untyped Document
            const canonical = await (globalThis as { fromUuid?: (uuid: string) => Promise<{ img?: string } | null> }).fromUuid?.(actorSourceUuid);
            if (canonical !== null && canonical !== undefined && typeof canonical.img === 'string' && canonical.img !== '' && canonical.img !== actor.img) {
                actor.updateSource?.({ img: canonical.img });
            }
        } catch {
            /* compendium not loaded yet */
        }
    }
    if (actorSystem !== null) actor.updateSource?.({ system: actorSystem });
    if (patches.length > 0 || actorSystem !== null) actor.reset?.();
    // Report from the single join site, so EVERY path (boot, import, sheet
    // render) surfaces a failed join without each caller re-implementing it.
    reportUnresolvedJoins(actor.name ?? 'Unknown actor', actor.uuid ?? actor.id ?? actor.name ?? '', unresolved);
    return { patched: patches.length, unresolved };
}
