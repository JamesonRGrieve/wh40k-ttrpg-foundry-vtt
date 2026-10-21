import { SYSTEM_ID } from './constants.ts';
import { contributesItemModifiers, type ModifierBearingItem } from './rules/item-modifier-eligibility.ts';

/**
 * Shared origin-grant resource ledger.
 *
 * Both grant-application mechanisms — the origin-path builder's `#commit` and
 * the boot-time {@link reconcileWorldOriginGrants} pass (via
 * `WH40KItem.applyOriginToActor`) — must agree on what an origin has already
 * contributed to an actor's resources (characteristics / wounds / fate). They
 * do that by reading and writing one ledger: the actor flag
 * `flags.wh40k-rpg.originGrantDeltas[<identityKey>]`.
 *
 * Keeping the ledger primitives here (rather than private to `item.ts`) lets
 * the builder record the deltas it bakes in via its absolute writes, so the
 * reconcile pass sees `priorDelta === newDelta` and becomes a no-op instead of
 * additively double-applying an origin's resource modifiers on the next world
 * `ready`. The two paths share one source of truth for the identity key and
 * the delta shape.
 */

/** Resource delta a single origin previously committed, recorded for idempotent re-application. */
export interface OriginAppliedDelta {
    characteristics?: Record<string, number>;
    wounds?: number;
    /** Fate-total (`fate.max`) contribution; an origin's `fateThreshold` grant lands here too. */
    fate?: number;
    /** Corruption-point grant. */
    corruption?: number;
    /** Insanity-point grant. */
    insanity?: number;
}

/** Flag path (under the system scope) where per-origin deltas are recorded. */
export const ORIGIN_GRANT_DELTAS_FLAG = 'originGrantDeltas';

/**
 * Minimal structural view of an origin item used to derive its stable identity
 * key. Matches what `WH40KItem` exposes and what the builder's committed
 * selection objects expose, so a single key derivation serves both call sites.
 */
export interface OriginIdentityItemLike {
    name: string;
    id?: string | null;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document _stats / flags shapes are modelled loosely by fvtt-types
    _stats?: { compendiumSource?: unknown } | undefined;
    // eslint-disable-next-line no-restricted-syntax -- boundary: see above
    flags?: { core?: { sourceId?: unknown } | undefined } | undefined;
}

/**
 * Stable identity key for an origin path, used to track the deltas this origin
 * has already committed to an actor so re-application converges instead of
 * double-counting. Prefers the compendium source UUID (survives renames);
 * falls back to the item id, then the name.
 */
export function originIdentityKey(item: OriginIdentityItemLike): string {
    const fromStats = item._stats?.compendiumSource;
    if (typeof fromStats === 'string' && fromStats.length > 0) return fromStats;
    const fromFlag = item.flags?.core?.sourceId;
    if (typeof fromFlag === 'string' && fromFlag.length > 0) return fromFlag;
    if (typeof item.id === 'string' && item.id.length > 0) return item.id;
    return `name:${item.name}`;
}

/**
 * Read the per-origin delta record stored on an actor at
 * `flags.wh40k-rpg.originGrantDeltas[<key>]`. Returns an empty delta when none
 * has been committed yet (so the first apply is purely additive).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: `flags` is the Foundry Document flags bag, untyped at the framework boundary
export function readOriginDelta(flags: unknown, key: string): OriginAppliedDelta {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor flags is an open Record at the Foundry document boundary
    const bag = (flags as Record<string, Record<string, unknown> | undefined> | undefined)?.[SYSTEM_ID]?.[ORIGIN_GRANT_DELTAS_FLAG];
    if (bag === undefined || bag === null || typeof bag !== 'object') return {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: per-origin delta entries are user-data-derived; narrowed to the numeric fields we read
    const flat = (bag as Record<string, OriginAppliedDelta | undefined>)[key];
    if (flat !== undefined) return flat;
    // The delta is written through the update path `originDeltaFlagPath(key)`, and a
    // compendium-UUID key is dotted (`Compendium.wh40k-rpg.<pack>.Item.<id>`), so
    // Foundry's update stores it nested one level per segment. Read it back the
    // same way; a flat lookup missed it, and every boot re-applied the origin.
    const nested = valueAtPath(bag, key);
    return nested !== null && typeof nested === 'object' ? nested : {};
}

/** The non-characteristic resources an origin's `modifiers.resources` block grants. */
export const ORIGIN_RESOURCES = ['wounds', 'fate', 'corruption', 'insanity'] as const;

/** One of {@link ORIGIN_RESOURCES}. */
export type OriginResource = (typeof ORIGIN_RESOURCES)[number];

/**
 * Opaque bag of origin modifiers as stored on the shared item schema
 * (`ModifiersTemplate`): characteristic changes under `characteristics`, and
 * Wounds / Fate / Corruption / Insanity under `resources`. Values are typed
 * `| undefined` because legacy / partially-authored origin documents can carry
 * sparse entries; {@link deltaFromModifiers} coerces them to the canonical
 * numeric delta both grant mechanisms compare against.
 */
export interface OriginModifierBag {
    characteristics?: Record<string, number | undefined>;
    resources?: Partial<Record<OriginResource, number | undefined>> | undefined;
}

/** What one origin contributes: non-zero characteristic changes plus every resource (0 when absent). */
export type OriginModifierDelta = { characteristics: Record<string, number> } & Record<OriginResource, number>;

/**
 * Reduce an origin's modifier bag to the canonical {@link OriginAppliedDelta}
 * the ledger records — only non-zero characteristic entries are kept, matching
 * what `applyOriginToActor` writes back. This is the single definition of "what
 * resources an origin contributes", consumed by both the reconcile applier and
 * the builder when it reconciles the ledger after its absolute writes.
 */
export function deltaFromModifiers(modifiers: OriginModifierBag | undefined): OriginModifierDelta {
    const delta: OriginModifierDelta = { characteristics: {}, wounds: 0, fate: 0, corruption: 0, insanity: 0 };
    const chars = modifiers?.characteristics ?? {};
    for (const [key, raw] of Object.entries(chars)) {
        const value = Number(raw ?? 0);
        if (value !== 0) delta.characteristics[key] = value;
    }
    for (const resource of ORIGIN_RESOURCES) delta[resource] = Number(modifiers?.resources?.[resource] ?? 0);
    return delta;
}

/** The {@link reconcileResourceDeltas} contribution an origin's {@link OriginModifierDelta} represents. */
export function originContribution(delta: OriginModifierDelta): ResourceContribution {
    const resources: Partial<Record<OriginResource, number>> = {};
    for (const resource of ORIGIN_RESOURCES) resources[resource] = delta[resource];
    return { characteristics: delta.characteristics, resources };
}

/**
 * The prior delta the origin-path builder reconciles against after its own
 * absolute writes. The builder bakes every origin's characteristic changes
 * into `characteristics.*.base`, so those count as already applied. A resource
 * it rewrote absolutely this commit (Wounds from the rolled total, Fate from
 * the rolled / threshold total) no longer carries any earlier origin
 * contribution, so its prior is 0 and the origin's modifier is added on top.
 * Every other resource (Corruption, Insanity, an unrolled Wounds / Fate) keeps
 * the prior the ledger recorded, so a re-commit never stacks it.
 * @param recorded  The delta the ledger holds for this origin.
 * @param delta  The origin's current contribution.
 * @param rewritten  The resources the builder wrote absolutely this commit.
 */
export function priorAfterBuilderWrites(recorded: OriginAppliedDelta, delta: OriginModifierDelta, rewritten: ReadonlySet<OriginResource>): OriginAppliedDelta {
    const prior: OriginAppliedDelta = { ...recorded, characteristics: { ...delta.characteristics } };
    for (const resource of rewritten) prior[resource] = 0;
    return prior;
}

/**
 * Build the `actor.update()` payload entry that records an origin's committed
 * delta on the actor flag. Returns the dot-path key and the delta value; the
 * caller merges it into its update bag. Keeping the path construction here
 * means both call sites use an identical flag layout.
 */
export function originDeltaFlagPath(identityKey: string): string {
    return `flags.${SYSTEM_ID}.${ORIGIN_GRANT_DELTAS_FLAG}.${identityKey}`;
}

/**
 * Per-resource `system.*` sub-paths the reverse-then-add writes for one applier.
 * Each resource maps to one prior-delta scalar but may fan out to several
 * sub-paths (e.g. wounds → `value` + `max`), all sharing that single prior.
 */
export type ResourcePathMap = Partial<Record<OriginResource, readonly string[]>>;

/**
 * Where `WH40KItem.applyOriginToActor` puts an origin's resources.
 * Wounds raise the maximum (a boot reconcile must not heal an injured
 * character). Fate raises the Fate total — `fate.max`, DH2's Fate threshold —
 * and the current points with it, since a character starts with his full Fate.
 * (The schema has no separate total field: #42.) Corruption and Insanity are
 * plain numbers on the character schema; an actor without them (an NPC) is
 * skipped by {@link reconcileResourceDeltas}.
 */
export const ORIGIN_RESOURCE_PATHS = {
    wounds: ['wounds.max'],
    fate: ['fate.max', 'fate.value'],
    corruption: ['corruption'],
    insanity: ['insanity'],
} as const satisfies ResourcePathMap;

/**
 * Where the origin-path builder puts an origin's resources at character
 * creation: as {@link ORIGIN_RESOURCE_PATHS}, but a new character starts at
 * full Wounds, so the current Wounds move with the maximum, as the builder's
 * own rolled-Wounds write does.
 */
export const BUILDER_ORIGIN_RESOURCE_PATHS = {
    ...ORIGIN_RESOURCE_PATHS,
    wounds: ['wounds.max', 'wounds.value'],
} as const satisfies ResourcePathMap;

/** A single origin/grant's resource contribution, normalized for {@link reconcileResourceDeltas}. */
export interface ResourceContribution {
    /** Characteristic changes keyed by characteristic id (e.g. `weaponSkill`). */
    characteristics: Record<string, number>;
    /** Non-characteristic resource bonuses; absent entries contribute nothing. */
    resources: Partial<Record<OriginResource, number>>;
}

/** Result of one reconcile: the `actor.update()` system-path bag plus the delta to record. */
export interface ResourceReconcileResult {
    // eslint-disable-next-line no-restricted-syntax -- boundary: the bag is an actor.update() payload (open-ended system.* paths + values)
    updates: Record<string, unknown>;
    newDelta: OriginAppliedDelta;
}

/** Walk a dot-path into an untyped system bag, returning the value or `undefined`. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the walked value out of the untyped Foundry actor `system` bag is genuinely of unknown shape; callers coerce it (`Number(... ?? 0)`) or guard it (`=== undefined`)
function valueAtPath(system: object, path: string): unknown {
    // eslint-disable-next-line no-restricted-syntax -- boundary: accumulator walking the untyped Foundry actor `system` bag by string path
    let node: unknown = system;
    for (const part of path.split('.')) {
        if (node === null || typeof node !== 'object') return undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: walking the untyped Foundry actor `system` bag by string path
        node = (node as Record<string, unknown>)[part];
    }
    return node;
}

/**
 * Reverse-then-add resource reconciliation used by `WH40KItem.applyOriginToActor`
 * (and available to any future origin/grant applier).
 *
 * For each characteristic and configured resource it computes
 * `current − priorDelta + contribution`, so re-applying the same contribution
 * converges instead of stacking — the ledger idempotency invariant. The
 * resource→path map is a parameter, NOT collapsed: `applyOriginToActor` writes
 * {@link ORIGIN_RESOURCE_PATHS}, while a resource-grant applier might write
 * `wounds.value`+`.max` / `fate.value`+`.max` plus corruption /
 * insanity — each passes its own {@link ResourcePathMap}. A resource's single
 * prior reverses across all of its configured sub-paths. A characteristic
 * change lands on `characteristics.*.base`, where the builder bakes origin
 * bonuses: `advance` counts +5 steps, so a +5 origin there would be +25.
 * Characteristics and resource paths the actor does not carry (an NPC has no
 * Corruption) are skipped, but still recorded in the returned delta, matching
 * {@link deltaFromModifiers}.
 *
 * Pure (no Foundry globals): reads the passed `system` snapshot and returns the
 * update bag for the caller to commit, plus the delta to stamp under
 * {@link originDeltaFlagPath}.
 */
export function reconcileResourceDeltas(
    system: object,
    contribution: ResourceContribution,
    priorDelta: OriginAppliedDelta,
    resourcePaths: ResourcePathMap,
): ResourceReconcileResult {
    // eslint-disable-next-line no-restricted-syntax -- boundary: the bag is an actor.update() payload (open-ended system.* paths + values)
    const updates: Record<string, unknown> = {};
    const newChars: Record<string, number> = {};

    // Characteristic changes (reverse prior, add current) on the base value.
    // Skip characteristics the actor does not have, but still record every
    // non-zero contribution in the delta.
    const priorChars = priorDelta.characteristics ?? {};
    const charKeys = new Set<string>([...Object.keys(contribution.characteristics), ...Object.keys(priorChars)]);
    for (const key of charKeys) {
        const value = Number(contribution.characteristics[key] ?? 0);
        if (value !== 0) newChars[key] = value;
        const prior = Number(priorChars[key] ?? 0);
        if (value === prior) continue;
        if (valueAtPath(system, `characteristics.${key}`) === undefined) continue;
        const current = Number(valueAtPath(system, `characteristics.${key}.base`) ?? 0);
        updates[`system.characteristics.${key}.base`] = current - prior + value;
    }

    const newDelta: OriginAppliedDelta = { characteristics: newChars };

    // Non-characteristic resources (reverse prior, add current) — each resource's
    // single prior reverses across every configured sub-path the actor carries.
    for (const [resource, paths] of Object.entries(resourcePaths) as Array<[OriginResource, readonly string[] | undefined]>) {
        if (paths === undefined) continue;
        const value = Number(contribution.resources[resource] ?? 0);
        newDelta[resource] = value;
        const prior = Number(priorDelta[resource] ?? 0);
        if (value === prior) continue;
        for (const path of paths) {
            const raw = valueAtPath(system, path);
            if (raw === undefined) continue;
            updates[`system.${path}`] = Number(raw ?? 0) - prior + value;
        }
    }

    return { updates, newDelta };
}

/* -------------------------------------------- */
/*  Item resource ledger (#691)                 */
/* -------------------------------------------- */

/**
 * Flag path (under the system scope) where each owned item's applied resources
 * are recorded: `flags.wh40k-rpg.itemResourceDeltas[<item id>]`.
 *
 * A talent, trait, condition or equipped item that carries `modifiers.resources`
 * (Fated for Greatness +1 Fate, Sound Constitution +1 Wounds, Chem Geld +1
 * Insanity) is applied to the stored totals through
 * {@link reconcileResourceDeltas}, exactly as an origin is: once, recorded here,
 * and reversed when the item goes, stops applying (unequipped) or changes its
 * value. Origins keep their own bag ({@link ORIGIN_GRANT_DELTAS_FLAG}), keyed by
 * compendium source; items are keyed by their owned id, since an actor can own
 * two copies of one compendium item.
 */
export const ITEM_RESOURCE_DELTAS_FLAG = 'itemResourceDeltas';

/** One owned item's resource contribution, as recorded by the item resource ledger. */
export type ItemResourceDelta = Record<OriginResource, number>;

/** An owned item as the item resource ledger reads it. */
export interface ItemResourceHolder {
    /** The owned item's id: the ledger key. */
    id: string;
    /** Whether the item's modifiers currently apply (`contributesItemModifiers`). */
    contributes: boolean;
    /** The item's `modifiers.resources`, when it declares any. */
    resources: Partial<Record<OriginResource, number | undefined>> | undefined;
}

/** An owned item as the actor holds it: what {@link itemResourceHolders} reads. */
export interface ResourceBearingItem extends ModifierBearingItem {
    id: string | null;
    system: ModifierBearingItem['system'] & { modifiers?: { resources?: ItemResourceHolder['resources'] } | null | undefined };
}

/** The ledger's view of an actor's owned items: every item but its origin paths, which keep their own bag. */
export function itemResourceHolders(items: Iterable<ResourceBearingItem>): ItemResourceHolder[] {
    const holders: ItemResourceHolder[] = [];
    for (const item of items) {
        if (item.isOriginPath || item.id === null || item.id === '') continue;
        holders.push({ id: item.id, contributes: contributesItemModifiers(item), resources: item.system.modifiers?.resources ?? undefined });
    }
    return holders;
}

/** Result of one item-ledger reconcile: the `actor.update()` bag, and the keys to unset once it lands. */
export interface ItemResourceReconcileResult {
    // eslint-disable-next-line no-restricted-syntax -- boundary: the bag is an actor.update() payload (open-ended system.* / flags.* paths + values)
    updates: Record<string, unknown>;
    /** Recorded items the actor no longer owns. Their entries are zeroed in `updates`; unset them after it lands. */
    staleKeys: string[];
}

/** The update path recording one owned item's delta. */
function itemResourceDeltaFlagPath(itemId: string): string {
    return `flags.${SYSTEM_ID}.${ITEM_RESOURCE_DELTAS_FLAG}.${itemId}`;
}

/** An item's contribution, every resource present (0 when absent). */
function itemResourceDelta(resources: ItemResourceHolder['resources']): ItemResourceDelta {
    const delta: ItemResourceDelta = { wounds: 0, fate: 0, corruption: 0, insanity: 0 };
    for (const resource of ORIGIN_RESOURCES) delta[resource] = Number(resources?.[resource] ?? 0);
    return delta;
}

/** What an item contributes right now: its resources while it applies, nothing otherwise. */
function currentItemDelta(item: ItemResourceHolder): ItemResourceDelta {
    return itemResourceDelta(item.contributes ? item.resources : undefined);
}

/** Whether a delta adds nothing. */
function isZeroDelta(delta: ItemResourceDelta): boolean {
    return ORIGIN_RESOURCES.every((resource) => delta[resource] === 0);
}

/**
 * Every owned item's recorded delta, read from
 * `flags.wh40k-rpg.itemResourceDeltas`. Empty when nothing has been recorded.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: `flags` is the Foundry Document flags bag, untyped at the framework boundary
export function readItemResourceDeltas(flags: unknown): Record<string, ItemResourceDelta> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor flags is an open Record at the Foundry document boundary
    const bag = (flags as Record<string, Record<string, unknown> | undefined> | undefined)?.[SYSTEM_ID]?.[ITEM_RESOURCE_DELTAS_FLAG];
    const recorded: Record<string, ItemResourceDelta> = {};
    if (bag === undefined || bag === null || typeof bag !== 'object') return recorded;
    for (const [key, entry] of Object.entries(bag)) {
        if (entry === null || typeof entry !== 'object') continue;
        recorded[key] = itemResourceDelta(entry as ItemResourceHolder['resources']);
    }
    return recorded;
}

/** Whether the actor has an item resource ledger yet (an empty one counts). */
// eslint-disable-next-line no-restricted-syntax -- boundary: `flags` is the Foundry Document flags bag, untyped at the framework boundary
function hasItemResourceLedger(flags: unknown): boolean {
    // eslint-disable-next-line no-restricted-syntax -- boundary: actor flags is an open Record at the Foundry document boundary
    const bag = (flags as Record<string, Record<string, unknown> | undefined> | undefined)?.[SYSTEM_ID]?.[ITEM_RESOURCE_DELTAS_FLAG];
    return bag !== undefined && bag !== null && typeof bag === 'object';
}

/**
 * Reconcile every owned item's resources against what the ledger recorded.
 *
 * The actor's stored totals already carry each item's recorded delta. Each item
 * now contributes its resources while it applies and nothing otherwise; an item
 * the actor no longer owns contributes nothing. One
 * {@link reconcileResourceDeltas} over the summed priors and contributions moves
 * the totals by the difference, so re-running converges and never stacks.
 * Totals never drop below 0, and the current Fate never exceeds the Fate total.
 * An actor with no ledger yet is seeded instead: every item it owns is recorded
 * as already applied and its totals stay as they are, whatever the world's
 * reconcile setting. Pure: reads the passed snapshots and returns the update bag.
 * @param system  The actor's `system` data.
 * @param flags  The actor's flags, holding the ledger.
 * @param items  Every owned item that is not an origin path.
 * @param resourcePaths  Where each resource lands.
 * @param freshItemIds  Items this change has just added. When seeding, these
 *   are applied rather than seeded, since the totals cannot already count them.
 */
export function reconcileItemResourceDeltas(
    system: object,
    // eslint-disable-next-line no-restricted-syntax -- boundary: `flags` is the Foundry Document flags bag, untyped at the framework boundary
    flags: unknown,
    items: readonly ItemResourceHolder[],
    resourcePaths: ResourcePathMap,
    freshItemIds: ReadonlySet<string> = new Set(),
): ItemResourceReconcileResult {
    // An actor with no ledger yet (first load after the ledger shipped, or a
    // character created with its items) has totals that already count the items
    // it owns: they are seeded as applied, never applied again. Only the items
    // this change just added (`freshItemIds`) move the totals.
    const seeding = !hasItemResourceLedger(flags);
    const recorded = seeding ? seedItemResourceDeltas(items.filter((item) => !freshItemIds.has(item.id))) : readItemResourceDeltas(flags);
    // eslint-disable-next-line no-restricted-syntax -- boundary: the bag is an actor.update() payload (open-ended system.* / flags.* paths + values)
    const updates: Record<string, unknown> = {};
    const changedEntries: Record<string, ItemResourceDelta> = {};
    const contribution: Partial<Record<OriginResource, number>> = {};
    const prior: OriginAppliedDelta = {};

    const account = (key: string, current: ItemResourceDelta): void => {
        const before = Object.hasOwn(recorded, key) ? recorded[key] : undefined;
        for (const resource of ORIGIN_RESOURCES) {
            contribution[resource] = (contribution[resource] ?? 0) + current[resource];
            prior[resource] = (prior[resource] ?? 0) + (before === undefined ? 0 : before[resource]);
        }
        const changed = before === undefined ? !isZeroDelta(current) : ORIGIN_RESOURCES.some((resource) => before[resource] !== current[resource]);
        if (changed) changedEntries[key] = current;
    };

    const owned = new Set<string>();
    for (const item of items) {
        owned.add(item.id);
        account(item.id, currentItemDelta(item));
    }
    const staleKeys = Object.keys(recorded).filter((key) => !owned.has(key));
    for (const key of staleKeys) account(key, itemResourceDelta(undefined));

    if (seeding) {
        // The first write creates the whole ledger, empty or not, so the next run reconciles instead of seeding.
        updates[`flags.${SYSTEM_ID}.${ITEM_RESOURCE_DELTAS_FLAG}`] = { ...recorded, ...changedEntries };
    } else {
        for (const [key, delta] of Object.entries(changedEntries)) updates[itemResourceDeltaFlagPath(key)] = delta;
    }

    const { updates: resourceUpdates } = reconcileResourceDeltas(system, { characteristics: {}, resources: contribution }, prior, resourcePaths);
    for (const [path, value] of Object.entries(resourceUpdates)) updates[path] = Math.max(0, Number(value));
    const fateValue = updates['system.fate.value'];
    if (typeof fateValue === 'number') {
        const fateMax = Number(updates['system.fate.max'] ?? valueAtPath(system, 'fate.max') ?? 0);
        updates['system.fate.value'] = Math.min(fateValue, fateMax);
    }
    return { updates, staleKeys };
}

/**
 * The ledger entries that record items as already counted in the actor's
 * totals, keyed by item id: every item that currently contributes.
 */
function seedItemResourceDeltas(items: readonly ItemResourceHolder[]): Record<string, ItemResourceDelta> {
    const seeded: Record<string, ItemResourceDelta> = {};
    for (const item of items) {
        const delta = currentItemDelta(item);
        if (!isZeroDelta(delta)) seeded[item.id] = delta;
    }
    return seeded;
}

/**
 * The flag updates that clear every recorded item contribution to the
 * resources the origin-path builder has just written absolutely (a rolled
 * Wounds or Fate total carries no item contribution), sent in the same update
 * as that write. The next reconcile then adds each item's resource on top.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: `flags` is the Foundry Document flags bag, untyped at the framework boundary
export function resetItemResourceDeltas(flags: unknown, rewritten: ReadonlySet<OriginResource>): Record<string, number> {
    const updates: Record<string, number> = {};
    for (const [key, delta] of Object.entries(readItemResourceDeltas(flags))) {
        for (const resource of rewritten) {
            if (delta[resource] !== 0) updates[`${itemResourceDeltaFlagPath(key)}.${resource}`] = 0;
        }
    }
    return updates;
}
