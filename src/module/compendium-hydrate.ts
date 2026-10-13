/**
 * Runtime hydration of LEAN embedded inventory items.
 *
 * Both world actors and compendium (pack) actors store their inventory DRY (see
 * docs/pack-authoring.md): each embedded item carries only `_stats.compendiumSource`
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

import { recoverOwnedItemLink } from './utils/compendium-query.ts';
import {
    inferActiveGameLine,
    materializeItemVariants,
    ownerGameLine,
    resolveOwnedLineContent,
    type SupportedLineKey,
    sameSourceValue,
} from './utils/item-variant-utils.ts';

/* eslint-disable no-restricted-syntax -- boundary: Foundry item/actor types carry open-ended Record<string,unknown> at framework boundaries */
type HydratableItem = {
    id: string | null;
    name: string | null;
    img: string | null;
    type: string;
    system: Record<string, unknown>;
    _source?: { system?: Record<string, unknown>; img?: string | null };
    _stats?: { compendiumSource?: string | null };
    updateSource?: (changes: Record<string, unknown>, options?: SourceReplaceOptions) => void;
};

type HydratableActor = {
    items: { contents: HydratableItem[] };
    /** The actor type (`<line>-<role>`), which names the line its items resolve to. */
    type?: string;
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
    updateSource?: (changes: Record<string, unknown>, options?: SourceReplaceOptions) => void;
};

type SourceLike = {
    img: string | null;
    /** The item type, naming the system DataModel the owner-line resolution cleans through. */
    type: string;
    system: Record<string, unknown>;
    _source?: { system?: Record<string, unknown> };
};

/** The `updateSource` option the join passes: replace root keys wholesale (see {@link REPLACE_SYSTEM}). */
type SourceReplaceOptions = { recursive: false };
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
function deepMerge(base: Record<string, unknown>, overlay: Record<string, unknown>, defaults: Record<string, unknown> = {}): Record<string, unknown> {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(overlay)) {
        const current = out[key];
        const fallback = defaults[key];
        if (isPlainObject(current) && isPlainObject(value)) {
            out[key] = deepMerge(current, value, isPlainObject(fallback) ? fallback : {});
            continue;
        }
        // An optional field the item never stored is declared `undefined` on its
        // sealed source (SystemDataModel.shimData), which is "absent", not a value.
        if (value === undefined) continue;
        // A lean embed's source is cleaned through its schema, so every field it
        // never stored holds the schema INITIAL — weapon `class: 'melee'`, `type:
        // 'primitive'`, armour points 0. Those are not authored values: letting
        // them win turned every lean weapon into a primitive melee weapon and every
        // lean armour into AP 0. A value equal to its schema default defers to the
        // canonical body; anything else the actor stored still wins.
        if (current !== undefined && key in defaults && sameSourceValue(value, fallback)) continue;
        // A LEAN embed persists no `system` on disk, so the overlay reaching this
        // join is the schema-prepared defaults (or the derived data), NOT authored
        // blanks: an empty-string field — `description.value` / `descriptionText` /
        // `summary` — is "unset", and must not clobber the canonical body's real
        // text (the #574 defect). A NON-empty overlay string still wins — a value
        // the actor genuinely customised — so "persisted wins" holds for everything
        // actually authored, and only the empty schema default defers to canonical.
        if (value === '' && typeof current === 'string' && current !== '') continue;
        out[key] = value;
    }
    return out;
}

/**
 * Per-instance runtime state: what the owning actor's play changes, not what
 * the compendium authors. A stored value here ALWAYS wins, default or not — an
 * emptied magazine (`clip.value: 0`) is the schema initial and a real state, and
 * must not refill from the canonical full clip on every load. `state` is the
 * documented home of runtime state (docs/pack-authoring.md "Stateful Fields Live
 * Under system.state"); the rest are runtime fields still in the legacy layout,
 * plus the per-actor fields a lean overlay carries.
 */
const INSTANCE_STATE_PATHS: readonly (readonly string[])[] = [
    ['state'],
    ['clip', 'value'],
    ['clip', 'magazine'],
    ['jammed'],
    ['rechargeMark'],
    ['uses', 'value'],
    ['quantity'],
    ['cost'],
    ['specialization'],
    ['level'],
];

/** The schema defaults with every instance-state path removed, so those never defer to canonical. */
function withoutInstanceState(schemaDefaults: Record<string, unknown>): Record<string, unknown> {
    const pruned = structuredClone(schemaDefaults);
    for (const path of INSTANCE_STATE_PATHS) {
        let parent: unknown = pruned;
        for (const segment of path.slice(0, -1)) parent = isPlainObject(parent) ? parent[segment] : undefined;
        const leaf = path.at(-1);
        if (isPlainObject(parent) && leaf !== undefined) delete parent[leaf];
    }
    return pruned;
}

/**
 * Pure join: canonical source system as the base layer, the item's PERSISTED
 * system overlaid on top (per-actor specialization/level/state/variantOf win).
 * `schemaDefaults` is the item type's cleaned empty source; a persisted value
 * equal to its default is the schema filling a gap, so canonical keeps it —
 * except on an instance-state path, where the stored value is always real.
 * No foundry-global dependency — unit-testable (cf. item-variant-utils' shim).
 */
export function buildHydratedSystem(
    sourceSystem: Record<string, unknown>,
    persistedSystem: Record<string, unknown>,
    schemaDefaults: Record<string, unknown> = {},
): Record<string, unknown> {
    return deepMerge(structuredClone(sourceSystem), persistedSystem, withoutInstanceState(schemaDefaults));
}

/** Per-type cache of each item system DataModel's cleaned empty source. */
const SCHEMA_DEFAULTS = new Map<string, Record<string, unknown>>();

/**
 * The item type's schema initials, as a stored source would carry them: its
 * system DataModel cleans an empty payload. Empty under headless tooling and
 * vitest, where no `CONFIG` exists — the join then only defers empty strings.
 */
function schemaDefaultsFor(type: string): Record<string, unknown> {
    const cached = SCHEMA_DEFAULTS.get(type);
    if (cached !== undefined) return cached;
    let defaults: Record<string, unknown> = {};
    if ('CONFIG' in globalThis) {
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.Item.dataModels is the untyped Foundry registry of system DataModel classes
        const model = (CONFIG.Item.dataModels as Record<string, { cleanData?: (source: Record<string, unknown>) => Record<string, unknown> } | undefined>)[
            type
        ];
        try {
            if (typeof model?.cleanData === 'function') defaults = model.cleanData({});
        } catch (err) {
            console.warn(`compendium-hydrate: could not read the ${type} schema defaults; schema initials will not defer to canonical`, err);
        }
    }
    SCHEMA_DEFAULTS.set(type, defaults);
    return defaults;
}
/* eslint-enable no-restricted-syntax */

/** The join key for one item: its compendium source, or its variant base. */
function joinUuid(item: HydratableItem): string | null {
    return item._stats?.compendiumSource ?? variantOfUuid(item.system);
}

/** Session cache of recovered links, keyed by line/type/identifier/name; `null` = none or ambiguous. */
const RECOVERED_LINKS = new Map<string, string | null>();

/**
 * The canonical UUID for an owned item stored with NO join key (#484).
 *
 * An item added before compendium links were recorded — or copied in some way
 * that dropped `_stats.compendiumSource` — could never be joined, so content
 * authored on the canonical later (Superior Chirurgeon's `modifiers.skills.medicae
 * = 20`) never reached it. Its canonical is recovered deterministically from the
 * OWNER's line packs: by `system.identifier`, else by exact name, and only when
 * exactly one candidate matches. Anything else leaves the item self-contained.
 * `null` under headless tooling and vitest, where no `game.packs` exists.
 */
async function recoverJoinUuid(item: HydratableItem, ownerLine: SupportedLineKey | null): Promise<string | null> {
    if (typeof game === 'undefined' || !('packs' in game)) return null;
    const name = item.name ?? '';
    // Not a warning: most unlinked items are genuinely self-contained (an NPC's
    // inline natural weapon), so a miss is logged on the system's debug channel.
    if (ownerLine === null) {
        game.wh40k.log(`compendium-hydrate: ${name} has no compendium link and its owner names no game line; leaving it unjoined`);
        return null;
    }
    const persisted = item._source?.system ?? item.system;
    const rawIdentifier = persisted['identifier'];
    const identifier = typeof rawIdentifier === 'string' ? rawIdentifier : '';
    const key = [ownerLine, item.type, identifier, identifier === '' ? name : ''].join('|');
    const cached = RECOVERED_LINKS.get(key);
    if (cached !== undefined) return cached;

    let recovered: string | null;
    try {
        recovered = await recoverOwnedItemLink({ type: item.type, identifier, name, linePrefix: ownerLine });
    } catch (err) {
        // Same best-effort contract as the join: an index that cannot load leaves
        // the item as stored, and is retried on the next pass (not cached).
        game.wh40k.log(`compendium-hydrate: could not search the ${ownerLine} packs for ${name}; leaving it unjoined`, err);
        return null;
    }
    if (recovered === null) {
        game.wh40k.log(`compendium-hydrate: ${name} (${item.type}) has no compendium link and no unique ${ownerLine} match; leaving it unjoined`);
    }
    RECOVERED_LINKS.set(key, recovered);
    return recovered;
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
 * Resolve an actor's `variantOf` chain into the base system layers to sit UNDER
 * its own values, nearest base first.
 *
 * Mirrors the item join: a named individual (the *Excrucian*) stores only what
 * makes it that individual and points at the unnamed class it instances (the
 * Devastation-class Cruiser), which holds the stats once. See
 * docs/pack-authoring.md "Actor atomization".
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

    return sameSourceValue(merged, persisted) ? null : merged;
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
 * join, and the list of join keys that did not resolve. An item with neither a
 * `compendiumSource` nor a `variantOf` joins the unique canonical recovered from
 * its owner's line packs (#484, {@link recoverJoinUuid}); with none, it is left
 * alone as self-contained. An actor that is its own base is left alone too.
 */
async function buildHydration(actor: HydratableActor): Promise<HydrationResult> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payloads are open-ended Records
    const patches: Array<Record<string, unknown>> = [];
    const unresolved: UnresolvedJoin[] = [];
    const cache = new Map<string, SourceLike | null>();
    // The line all of this actor's embedded items resolve their per-line variant
    // containers to (their owning actor's line), computed once for the pass.
    const lineKey = inferActiveGameLine({ actor });
    const ownerLine = ownerGameLine(actor);

    for (const item of actor.items.contents) {
        if (item.id === null) continue;
        const storedUuid = joinUuid(item);
        // eslint-disable-next-line no-await-in-loop -- sequential is intentional: recovery shares the session link cache, so a repeated item searches once
        const uuid = storedUuid ?? (await recoverJoinUuid(item, ownerLine));
        if (uuid === null) continue;
        // A recovered link is recorded on the item (in memory, like the join) so
        // every consumer of `_stats.compendiumSource` sees it.
        const recoveredLink = storedUuid === null ? uuid : null;

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

        // Resolve the canonical body's per-line variant containers to the OWNING
        // actor's line BEFORE the merge. The fetched canonical was itself flattened
        // to the WORLD line when it loaded, so its recorded unflattened source is
        // re-resolved for this actor, and any persisted value that is merely an
        // unedited world-line copy is re-pointed to the actor's line (in memory
        // only — "persisted wins" for anything the actor customised).
        // `updateSource` (the hydration write path) re-cleans WITHOUT running
        // `_migrateData`, so an unresolved container (e.g. `description: { rt:
        // { value } }`) would be stripped by the schema; the fallback materialize
        // covers a canonical with no recorded source (#574). A no-op when flat.
        const persisted = item._source?.system ?? item.system;
        const ownedLine = resolveOwnedLineContent(source, persisted, lineKey);
        const defaults = schemaDefaultsFor(item.type);
        const merged =
            ownedLine === null
                ? buildHydratedSystem(materializeItemVariants(structuredClone(source.system), lineKey), persisted, defaults)
                : buildHydratedSystem(ownedLine.base, ownedLine.overlay, defaults);
        // Order-insensitive no-op check (as the actor path uses), so a re-render of
        // an already-hydrated item does not needlessly re-patch and `reset()`.
        if (recoveredLink === null && sameSourceValue(merged, persisted)) continue; // already full — no-op

        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry update payload
        const patch: Record<string, unknown> = { _id: item.id, system: merged };
        if (recoveredLink !== null) patch['compendiumSource'] = recoveredLink;
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
 * Commit the joined `system` as a wholesale replacement, not a recursive merge.
 *
 * A DataModel's `_source` is `Object.seal`ed, and Foundry builds the system
 * model with `copy: false`, so `item._source.system` itself is sealed. A schema
 * field declared `required: false` with no `initial` (origin-path `effectText`,
 * talent `specialization`) is simply absent from a lean item's source, and a
 * recursive commit then tries to ADD that key to the sealed object — "Cannot add
 * property effectText, object is not extensible". `recursive: false` makes
 * Foundry treat `system` as a ForcedReplacement and swap in the fresh merged
 * object, which is already the complete join, so nothing is lost.
 */
const REPLACE_SYSTEM: SourceReplaceOptions = { recursive: false };

/**
 * As {@link hydrateActorInMemory}, but also reports the join keys that did not
 * resolve so the caller can surface them. A silent drop is what made #499 read
 * as "the hybrid was authored without claws" instead of "the claws didn't load".
 */
async function hydrateActorReporting(actor: HydratableActor): Promise<{ patched: number; unresolved: UnresolvedJoin[] }> {
    const { patches, unresolved, actorSystem } = await buildHydration(actor);
    let patched = 0;
    for (const patch of patches) {
        const item = actor.items.contents.find((i) => i.id === patch['_id']);
        // One item whose canonical body fails validation must not abort the whole
        // join: the boot path awaits every actor, so a throw here used to stop the
        // system's `ready` before conditions, caches and the event graph loaded.
        try {
            item?.updateSource?.({ system: patch['system'], ...(patch['img'] !== undefined ? { img: patch['img'] } : {}) }, REPLACE_SYSTEM);
            // A recovered link merges INTO `_stats` (recursive) — replacing it
            // wholesale would drop the item's other document stats.
            if (typeof patch['compendiumSource'] === 'string') item?.updateSource?.({ _stats: { compendiumSource: patch['compendiumSource'] } });
            patched += 1;
        } catch (err) {
            console.error(
                `compendium-hydrate: skipped item ${String(patch['_id'])} on ${actor.name ?? 'Unknown actor'}; its canonical body failed validation`,
                err,
            );
        }
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
    if (actorSystem !== null) actor.updateSource?.({ system: actorSystem }, REPLACE_SYSTEM);
    if (patched > 0 || actorSystem !== null) actor.reset?.();
    // Report from the single join site, so EVERY path (boot, import, sheet
    // render) surfaces a failed join without each caller re-implementing it.
    reportUnresolvedJoins(actor.name ?? 'Unknown actor', actor.uuid ?? actor.id ?? actor.name ?? '', unresolved);
    return { patched, unresolved };
}
