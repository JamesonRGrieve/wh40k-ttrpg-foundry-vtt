/**
 * A voidcraft's build rules: the essential component slots, the ship-point
 * budget, and the stats owned items modify (#714).
 *
 * Pure functions and constants. They lived on `data/actor/voidcraft.ts`, which
 * the voidcraft sheet then imported, reaching into the data layer; the sheet and
 * the DataModel both read them from here now.
 */

/** The Build Summary source type of a Crippled-ship stat change (#187). */
export const CRIPPLED_SOURCE_TYPE = 'crippled';

/** Subset of ship-component item.system fields used in voidcraft preparation. */
export interface ShipComponentSystem {
    condition?: string;
    componentType?: string;
    essential?: boolean;
    power?: { generated?: number; used?: number } | number;
    space?: number;
    shipPoints?: number;
    modifiers?: Record<string, number>;
    /** ship-role only — bonuses applied while the role is staffed. */
    shipBonuses?: { manoeuvrability?: number; detection?: number; ballisticSkill?: number; crewRating?: number };
}

/** The three item types whose `shipPoints` count toward the build budget. */
export function contributesSp(type: string): boolean {
    return type === 'shipComponent' || type === 'shipWeapon' || type === 'shipUpgrade';
}

/**
 * A component fills its essential slot only while functional. Missing
 * `condition` (legacy / un-tracked items) is treated as functional.
 */
function isFunctional(sys: { condition?: string }): boolean {
    return sys.condition === undefined || sys.condition === 'functional';
}

/**
 * Stat keys that owned items can modify on a starship. Authored as a
 * literal-typed tuple so the iterator in `_recomputeAppliedModifiers` narrows
 * each key against the typed `appliedModifiers` record without needing a
 * runtime guard against Record-of-string widening.
 */
export const SHIP_MODIFIER_STAT_KEYS = [
    'speed',
    'manoeuvrability',
    'detection',
    'armour',
    'hullIntegrity',
    'turretRating',
    'voidShields',
    'morale',
    'crewRating',
    'ballisticSkill',
    'weaponCapacityDorsal',
    'weaponCapacityProw',
    'weaponCapacityPort',
    'weaponCapacityStarboard',
    'weaponCapacityKeel',
] as const;

/** Union of every stat key the modifier engine recognizes. */
export type ShipModifierStatKey = (typeof SHIP_MODIFIER_STAT_KEYS)[number];

/**
 * A single contribution to a modified ship stat. Identifies the source item
 * by both `uuid` (the world-relative UUID, suitable for `fromUuid()`) and
 * `sourceUuid` (the compendium UUID it was instantiated from, when known —
 * the canonical reference for Direction #11 UUID-primary content links).
 */
export interface ShipStatModifierSource {
    /** Display name from the owning item. */
    name: string;
    /** Item type (`shipComponent` | `shipUpgrade` | `shipRole`), or `crippled` for the Crippled-ship rule (#187). */
    type: string;
    /** The world-instance UUID for hover-link / inspection. */
    uuid: string;
    /** The compendium UUID the item was instantiated from. Empty when world-only. */
    sourceUuid: string;
    /** Signed integer contribution to the stat. */
    value: number;
}

/** Per-stat applied-modifier rollup: total + ordered list of contributing sources. */
export interface ShipAppliedModifier {
    total: number;
    sources: ShipStatModifierSource[];
}

/**
 * RAW Rogue Trader requires every hull to be fitted with a fixed inventory of
 * essential components before launch. These slots are content-agnostic — they
 * apply to every hull class — so the slot list is a primitive enum maintained
 * in code. Each slot's *filling* (which compendium component fills it) is the
 * content-specific part and lives on the actor's owned items.
 */
export const ESSENTIAL_SHIP_SLOTS: readonly string[] = [
    'plasmaDrive',
    'warpDrive',
    'gellarField',
    'voidShields',
    'bridge',
    'lifeSupport',
    'quarters',
    'auger',
] as const;

/** Validation result for a voidcraft build (computed in prepareDerivedData). */
export interface VoidcraftBuildValidation {
    /** SP currently allocated across owned components + weapons + upgrades. */
    spent: number;
    /** SP budget granted by the hull (mirrors `shipPoints.budget`). */
    budget: number;
    /** True when `spent > budget`. */
    isOverBudget: boolean;
    /** Essential slot names that have no owned component filling them. */
    missingEssentialSlots: string[];
    /** Convenience: build is valid iff !isOverBudget && missingEssentialSlots.length === 0. */
    isValid: boolean;
}

/**
 * Pure validator usable from tests and the sheet without prepping the full
 * DataModel. Returns a `VoidcraftBuildValidation` for the given budget and
 * iterable of component-like views.
 */
export function validateVoidcraftBuild(budget: number, items: Iterable<{ type: string; system: ShipComponentSystem }>): VoidcraftBuildValidation {
    let spent = 0;
    const covered = new Set<string>();
    for (const item of items) {
        const sys = item.system;
        if (contributesSp(item.type)) {
            spent += sys.shipPoints ?? 0;
        }
        if (item.type === 'shipComponent' && typeof sys.componentType === 'string' && isFunctional(sys)) {
            covered.add(sys.componentType);
        }
    }
    const missing: string[] = ESSENTIAL_SHIP_SLOTS.filter((slot) => !covered.has(slot));
    const isOverBudget = spent > budget;
    return {
        spent,
        budget,
        isOverBudget,
        missingEssentialSlots: missing,
        isValid: !isOverBudget && missing.length === 0,
    };
}

/**
 * Returns the zero-state for `appliedModifiers`. Every stat key in
 * `SHIP_MODIFIER_STAT_KEYS` is present with `total: 0` and an empty
 * `sources` array — the Build Summary panel can iterate the full set
 * without guarding on `undefined`.
 */
export function emptyAppliedModifiers(): Record<ShipModifierStatKey, ShipAppliedModifier> {
    // eslint-disable-next-line no-restricted-syntax -- bootstrap: empty record is built up below before being returned
    const out = {} as Record<ShipModifierStatKey, ShipAppliedModifier>;
    for (const key of SHIP_MODIFIER_STAT_KEYS) {
        out[key] = { total: 0, sources: [] };
    }
    return out;
}
