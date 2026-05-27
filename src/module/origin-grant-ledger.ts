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
