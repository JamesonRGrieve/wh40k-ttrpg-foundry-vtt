import { SYSTEM_ID } from './constants.ts';

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
    fate?: number;
    /** Origin-path `fateThreshold` grant (burn-fate / cheat-death threshold). */
    fateThreshold?: number;
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
    const entry = (bag as Record<string, OriginAppliedDelta | undefined>)[key];
    return entry ?? {};
}

/**
 * Opaque bag of origin modifiers as stored on the shared item schema. Values
 * are typed `| undefined` because legacy / partially-authored origin documents
 * can carry sparse entries; {@link deltaFromModifiers} coerces them to the
 * canonical numeric delta both grant mechanisms compare against.
 */
export interface OriginModifierBag {
    characteristics?: Record<string, number | undefined>;
    wounds?: number | undefined;
    fate?: number | undefined;
}

/**
 * Reduce an origin's modifier bag to the canonical {@link OriginAppliedDelta}
 * the ledger records — only non-zero characteristic entries are kept, matching
 * what `applyOriginToActor` writes back. This is the single definition of "what
 * resources an origin contributes", consumed by both the reconcile applier and
 * the builder when it stamps the ledger after its absolute writes.
 */
export function deltaFromModifiers(modifiers: OriginModifierBag | undefined): { characteristics: Record<string, number>; wounds: number; fate: number } {
    const delta: { characteristics: Record<string, number>; wounds: number; fate: number } = { characteristics: {}, wounds: 0, fate: 0 };
    const chars = modifiers?.characteristics ?? {};
    for (const [key, raw] of Object.entries(chars)) {
        const value = Number(raw ?? 0);
        if (value !== 0) delta.characteristics[key] = value;
    }
    delta.wounds = Number(modifiers?.wounds ?? 0);
    delta.fate = Number(modifiers?.fate ?? 0);
    return delta;
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
 * Non-characteristic resources the reverse-then-add reconcile loop can write.
 * Each maps to one prior-delta scalar but may fan out to several `system.*`
 * sub-paths (e.g. wounds → `value` + `max`), all sharing that single prior.
 */
type ReconcilableResource = 'wounds' | 'fate' | 'fateThreshold' | 'corruption' | 'insanity';

/** Per-resource `system.*` sub-paths the reverse-then-add writes for one applier. */
export type ResourcePathMap = Partial<Record<ReconcilableResource, readonly string[]>>;

/** A single origin/grant's resource contribution, normalized for {@link reconcileResourceDeltas}. */
export interface ResourceContribution {
    /** Characteristic advances keyed by characteristic id (e.g. `weaponSkill`). */
    characteristics: Record<string, number>;
    /** Non-characteristic resource bonuses; absent entries contribute nothing. */
    resources: Partial<Record<ReconcilableResource, number>>;
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
 * `wounds.max` / `fate.total` only, while a resource-grant applier might write
 * `wounds.value`+`.max` / `fate.value`+`.max` plus threshold / corruption /
 * insanity — each passes its own {@link ResourcePathMap}. A resource's single
 * prior reverses across all of its configured sub-paths. Characteristics the
 * actor does not carry are skipped (no advance slot to write) but still recorded
 * in the returned delta, matching {@link deltaFromModifiers}.
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

    // Characteristic advances (reverse prior, add current). Skip characteristics
    // the actor does not have — there is no advance slot to write — but still
    // record every non-zero contribution in the delta.
    const priorChars = priorDelta.characteristics ?? {};
    const charKeys = new Set<string>([...Object.keys(contribution.characteristics), ...Object.keys(priorChars)]);
    for (const key of charKeys) {
        const value = Number(contribution.characteristics[key] ?? 0);
        if (value !== 0) newChars[key] = value;
        const prior = Number(priorChars[key] ?? 0);
        if (value === prior) continue;
        if (valueAtPath(system, `characteristics.${key}`) === undefined) continue;
        const current = Number(valueAtPath(system, `characteristics.${key}.advance`) ?? 0);
        updates[`system.characteristics.${key}.advance`] = current - prior + value;
    }

    const newDelta: OriginAppliedDelta = { characteristics: newChars };

    // Non-characteristic resources (reverse prior, add current) — each resource's
    // single prior reverses across every configured sub-path.
    for (const [resource, paths] of Object.entries(resourcePaths) as Array<[ReconcilableResource, readonly string[] | undefined]>) {
        if (paths === undefined) continue;
        const value = Number(contribution.resources[resource] ?? 0);
        newDelta[resource] = value;
        const prior = Number(priorDelta[resource] ?? 0);
        if (value === prior) continue;
        for (const path of paths) {
            const current = Number(valueAtPath(system, path) ?? 0);
            updates[`system.${path}`] = current - prior + value;
        }
    }

    return { updates, newDelta };
}
