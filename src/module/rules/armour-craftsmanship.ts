/**
 * Armour craftsmanship, as each line prints it (#679, #248, #158). One table per
 * line, held in the line config and read by the armour soak, the armour item's
 * effective AP and Only War's craftsmanship panel alike:
 *
 *   - DH1 (core p. 144), RT (core p. 137) and OW: Poor −10 to Agility tests;
 *     Good +1 AP against the first attack in any round; Best half weight and
 *     +1 AP.
 *   - DW: the same Good and Best, named Exceptional and Master-Crafted; it
 *     prints no Poor armour.
 *   - DH2 (core p. 141): Good and Best raise Maximum Agility by 10 (not modelled
 *     here) and Best adds +1 AP to each covered location. No first-attack AP, no
 *     half weight.
 *   - BC: Good grants +5 to a social test (not an armour effect); Best adds that,
 *     half weight and +1 AP. Poor −10 to Agility tests.
 */

/** The four armour craftsmanship tiers every line's table is keyed by. */
export type ArmourCraftsmanshipTier = 'poor' | 'common' | 'good' | 'best';

/** What one tier does to a piece of armour. */
export interface ArmourCraftsmanshipEffect {
    /** Agility-test modifier while worn (Poor −10 where printed). */
    readonly agilityModifier: number;
    /** AP added against the first attack each round (Good, where printed). */
    readonly apFirstHit: number;
    /** The armour weighs half (Best, where printed). */
    readonly halfWeight: boolean;
    /** AP added to every covered location (Best). */
    readonly flatApBonus: number;
}

/** A line's armour craftsmanship table. */
export type ArmourCraftsmanshipTable = Readonly<Record<ArmourCraftsmanshipTier, ArmourCraftsmanshipEffect>>;

function effect(agilityModifier: number, apFirstHit: number, halfWeight: boolean, flatApBonus: number): ArmourCraftsmanshipEffect {
    return Object.freeze({ agilityModifier, apFirstHit, halfWeight, flatApBonus });
}

const COMMON = effect(0, 0, false, 0);

const FIRST_ATTACK_GOOD = effect(0, 1, false, 0);
const HALF_WEIGHT_BEST = effect(0, 0, true, 1);

/** DH1, RT and OW: Poor −10 Agility, Good +1 AP on the first attack, Best half weight and +1 AP. */
export const PRINTED_ARMOUR_CRAFTSMANSHIP: ArmourCraftsmanshipTable = Object.freeze({
    poor: effect(-10, 0, false, 0),
    common: COMMON,
    good: FIRST_ATTACK_GOOD,
    best: HALF_WEIGHT_BEST,
});

/** DW: Exceptional (Good) +1 AP on the first attack, Master-Crafted (Best) half weight and +1 AP; no Poor. */
export const DW_ARMOUR_CRAFTSMANSHIP: ArmourCraftsmanshipTable = Object.freeze({
    poor: COMMON,
    common: COMMON,
    good: FIRST_ATTACK_GOOD,
    best: HALF_WEIGHT_BEST,
});

/** DH2: only Best touches AP (+1 per covered location); Good / Best's Maximum Agility is not an AP effect. */
export const DH2_ARMOUR_CRAFTSMANSHIP: ArmourCraftsmanshipTable = Object.freeze({
    poor: COMMON,
    common: COMMON,
    good: COMMON,
    best: effect(0, 0, false, 1),
});

/** BC: Poor −10 Agility, Good a social bonus (no AP), Best half weight and +1 AP. */
export const BC_ARMOUR_CRAFTSMANSHIP: ArmourCraftsmanshipTable = Object.freeze({
    poor: effect(-10, 0, false, 0),
    common: COMMON,
    good: COMMON,
    best: HALF_WEIGHT_BEST,
});

/** A line that prints no armour craftsmanship effects. */
export const NO_ARMOUR_CRAFTSMANSHIP: ArmourCraftsmanshipTable = Object.freeze({ poor: COMMON, common: COMMON, good: COMMON, best: COMMON });

/** Every stored craftsmanship that reads as a tier other than Common. */
const STORED_ARMOUR_TIERS: ReadonlyMap<string, ArmourCraftsmanshipTier> = new Map<string, ArmourCraftsmanshipTier>([
    ['poor', 'poor'],
    ['good', 'good'],
    ['best', 'best'],
    ['exceptional', 'good'],
    ['master', 'best'],
    ['master-crafted', 'best'],
]);

/**
 * The tier a stored craftsmanship reads as on armour. Deathwatch's Exceptional
 * armour is its Good ("against the first attack in any round … +1 AP") and its
 * Master-Crafted armour its Best ("weighs half … increases AP by 1"), stored as
 * `exceptional` / `master` (and the odd authored `master-crafted`). Anything
 * unknown is Common.
 */
export function armourCraftsmanshipTier(stored: string | undefined): ArmourCraftsmanshipTier {
    return (stored === undefined ? undefined : STORED_ARMOUR_TIERS.get(stored)) ?? 'common';
}
