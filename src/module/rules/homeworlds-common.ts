/**
 * Shared shapes + lookup for the DH2 supplement homeworld registries (#302, #338).
 *
 * Per Direction #7 (#338) the basic mechanical VALUES (characteristic mods, Fate
 * threshold, wounds, aptitude) are authored once in the compendium packs and read
 * at render time via `src/module/rules/homeworld-compendium.ts`. The registries in
 * this directory keep ONLY the supplement-specific data the compendium does not
 * carry: the structured riders plus the per-supplement key-talent /
 * recommended-background / mechanical-hook prose.
 *
 * The Without and Beyond supplement tables are structural twins for the slimmed
 * portion: the same four base `Def` fields, differing only by their `id` union and
 * their supplement-specific riders. This module is the single source of that shared
 * base shape; each supplement file extends {@link HomeworldDefBase} and appends its
 * own riders.
 *
 * Pure data/util — no Foundry imports, system-agnostic (a future RT/BC
 * homeworld-supplement table is a trivial `extends HomeworldDefBase`).
 */

/**
 * The fields every supplement homeworld `Def` shares AFTER the compendium-sourced
 * basics were removed (#338). Supplements extend this, narrowing `id` to their own
 * union and appending their riders. The characteristic mods / Fate threshold /
 * wounds / aptitude now live in the compendium and are joined at render time by the
 * info dialogs.
 */
export interface HomeworldDefBase {
    /** Registry key (stable camelCase id matching the supplement's union). */
    readonly id: string;
    /** Display label (a `WH40K.*Homeworld.*` langpack key, localized at render time). */
    readonly label: string;
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
