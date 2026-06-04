/**
 * Shared shapes + lookup for the DH2 supplement homeworld registries (#302).
 *
 * The Without and Beyond supplement tables are structural twins: identical
 * characteristic-mod / fate-threshold / wounds sub-shapes and the same nine
 * base `Def` fields, differing only by their `id` union and their
 * supplement-specific riders. This module is the single source of those shared
 * shapes; each supplement file extends {@link HomeworldDefBase} and appends its
 * own riders.
 *
 * The Within supplement uses a deliberately different `Def` shape (bonuses named
 * `positive` / `negative`, an `emperorsBlessingMin` trigger, a `flat`/`dice`/
 * `faces` wounds roll, a named `homeWorldBonus` instead of `mechanicalHook`), so
 * it does NOT extend the base — but it shares the generic {@link lookupById}
 * accessor. Keeping the riders (and Within's distinct shape) separate is
 * deliberate; do not collapse them into the base.
 *
 * Pure data/util — no Foundry imports, system-agnostic (a future RT/BC
 * homeworld-supplement table is a trivial `extends HomeworldDefBase`).
 */

/** Characteristic-mod tuple: the bonus and penalty characteristic-id lists. */
interface HomeworldCharacteristicMods {
    readonly bonuses: readonly string[];
    readonly penalties: readonly string[];
}

/** Fate-threshold rule: base value + Emperor's Blessing trigger (`d10 >= N`). */
interface HomeworldFateThreshold {
    readonly base: number;
    readonly emperorsBlessing: number;
}

/** Starting wounds — `<base> + 1d<dieFaces>` form (a d5 across current tables). */
interface HomeworldWounds {
    readonly base: number;
    readonly dieFaces: 5;
}

/**
 * The nine fields every supplement homeworld `Def` shares. Supplements extend
 * this, narrowing `id` to their own union and appending their riders.
 */
export interface HomeworldDefBase {
    /** Registry key (stable id used by other modules). */
    readonly id: string;
    /** Display label (a `WH40K.*Homeworld.*` langpack key, localized at render time). */
    readonly label: string;
    readonly characteristicMods: HomeworldCharacteristicMods;
    readonly fateThreshold: HomeworldFateThreshold;
    readonly wounds: HomeworldWounds;
    readonly aptitude: string;
    /** Key talents and skills granted at character creation. */
    readonly keyTalents: readonly string[];
    /** Recommended backgrounds per RAW. */
    readonly recommendedBackgrounds: readonly string[];
    /** Human-readable mechanical hook (also drives the GM info dialog body). */
    readonly mechanicalHook: string;
}

/**
 * Generic typed lookup over an id-keyed registry. `Object.hasOwn` guards against
 * inherited keys (e.g. an id of `"toString"`), so only own entries resolve;
 * returns `undefined` for any id not present.
 */
export function lookupById<K extends string, T>(table: Record<K, T>, id: string): T | undefined {
    return Object.hasOwn(table, id) ? table[id as K] : undefined;
}
