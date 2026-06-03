/**
 * Only War · Craftsmanship effects (#158 — OW core.md §"WEAPON AND
 * ARMOUR CRAFTSMANSHIP" lines 7258-7288).
 *
 * Pure rules / math layer. The four Craftsmanship tiers (Poor, Common,
 * Good, Best) modify ranged-weapon reliability, melee-weapon test and
 * damage values, and armour AP / Agility / weight. These shifts are
 * RAW-fixed mechanical adjustments — not compendium content — so they
 * live in this module as static tables keyed by tier.
 *
 * Per Direction #7 the consumer (weapon-quality-effects, armour
 * DataModel, attack-roll prompt) reads the tier off the owned item's
 * shared `craftsmanship` field and walks these tables; the engine has
 * no Foundry / Document coupling, no RNG, no I/O.
 *
 * RAW summary:
 *   - Ranged weapons: Poor → Unreliable (jam on any failure),
 *     Common → standard, Good → Reliable (jam reduced), Best → Never
 *     Jams.
 *   - Melee weapons: Poor → -10 to Weapon Skill tests with the weapon,
 *     Common → standard, Good → +5 WS, Best → +10 WS and +1 Damage.
 *   - Armour: Poor → -10 to Agility tests, Common → standard,
 *     Good → +1 AP against the first hit each round, Best → half weight
 *     and +1 AP.
 */

/* -------------------------------------------------------------------- */
/*  Tier identifier                                                     */
/* -------------------------------------------------------------------- */

/** Craftsmanship tier identifiers. */
export type Craftsmanship = 'poor' | 'common' | 'good' | 'best';

/** Stable iteration order for chat / sheet rendering. */
export const CRAFTSMANSHIP_TIERS: ReadonlyArray<Craftsmanship> = Object.freeze(['poor', 'common', 'good', 'best']);

/* -------------------------------------------------------------------- */
/*  Effect shapes                                                       */
/* -------------------------------------------------------------------- */

/**
 * The Craftsmanship-driven reliability shift applied to a ranged weapon.
 *
 *   - `unreliable` — Poor: gain the Unreliable quality (jam on any failed
 *     attack test).
 *   - `standard` — Common: no change to the weapon's base reliability
 *     behaviour.
 *   - `reliable` — Good: gain the Reliable quality (jam chance reduced).
 *   - `never-jams` — Best: the weapon never jams regardless of result.
 */
type RangedReliabilityShift = 'unreliable' | 'standard' | 'reliable' | 'never-jams';

/**
 * Mechanical effect of Craftsmanship on a ranged weapon. The shift is
 * applied on top of the weapon's intrinsic qualities — a weapon that is
 * already Reliable and stamped Best still resolves as Never Jams; a
 * weapon that already has Unreliable stays Unreliable even at Common.
 */
export interface RangedCraftsmanshipEffect {
    readonly reliabilityShift: RangedReliabilityShift;
}

/**
 * Mechanical effect of Craftsmanship on a melee weapon.
 *
 *   - `weaponSkillModifier`: flat WS-test modifier applied when this
 *     weapon is used to attack. Poor weapons impose -10; Good grants
 *     +5; Best grants +10.
 *   - `damageBonus`: flat damage modifier added to the weapon's roll.
 *     Only Best contributes (+1); Poor/Common/Good are 0.
 */
export interface MeleeCraftsmanshipEffect {
    readonly weaponSkillModifier: number;
    readonly damageBonus: number;
}

/**
 * Mechanical effect of Craftsmanship on an armour piece.
 *
 *   - `agilityModifier`: flat Agility-test modifier while the armour is
 *     worn. Only Poor imposes a penalty (-10); all other tiers are 0.
 *   - `apFirstHit`: bonus AP applied only to the first hit suffered each
 *     round. Good grants +1; all other tiers are 0.
 *   - `halfWeight`: when true, the armour's encumbrance is halved. Only
 *     Best sets this flag.
 *   - `flatApBonus`: bonus AP applied to every hit. Only Best grants +1.
 */
export interface ArmourCraftsmanshipEffect {
    readonly agilityModifier: number;
    readonly apFirstHit: number;
    readonly halfWeight: boolean;
    readonly flatApBonus: number;
}

/* -------------------------------------------------------------------- */
/*  Static effect tables                                                */
/* -------------------------------------------------------------------- */

/**
 * Ranged-weapon Craftsmanship table (OW core.md §"Weapon and Armour
 * Craftsmanship", ranged column).
 */
export const OW_RANGED_CRAFTSMANSHIP: Readonly<Record<Craftsmanship, RangedCraftsmanshipEffect>> = Object.freeze({
    poor: Object.freeze({ reliabilityShift: 'unreliable' }),
    common: Object.freeze({ reliabilityShift: 'standard' }),
    good: Object.freeze({ reliabilityShift: 'reliable' }),
    best: Object.freeze({ reliabilityShift: 'never-jams' }),
});

/**
 * Melee-weapon Craftsmanship table (OW core.md §"Weapon and Armour
 * Craftsmanship", melee column).
 */
export const OW_MELEE_CRAFTSMANSHIP: Readonly<Record<Craftsmanship, MeleeCraftsmanshipEffect>> = Object.freeze({
    poor: Object.freeze({ weaponSkillModifier: -10, damageBonus: 0 }),
    common: Object.freeze({ weaponSkillModifier: 0, damageBonus: 0 }),
    good: Object.freeze({ weaponSkillModifier: 5, damageBonus: 0 }),
    best: Object.freeze({ weaponSkillModifier: 10, damageBonus: 1 }),
});

/**
 * Armour Craftsmanship table (OW core.md §"Weapon and Armour
 * Craftsmanship", armour column).
 */
export const OW_ARMOUR_CRAFTSMANSHIP: Readonly<Record<Craftsmanship, ArmourCraftsmanshipEffect>> = Object.freeze({
    poor: Object.freeze({ agilityModifier: -10, apFirstHit: 0, halfWeight: false, flatApBonus: 0 }),
    common: Object.freeze({ agilityModifier: 0, apFirstHit: 0, halfWeight: false, flatApBonus: 0 }),
    good: Object.freeze({ agilityModifier: 0, apFirstHit: 1, halfWeight: false, flatApBonus: 0 }),
    best: Object.freeze({ agilityModifier: 0, apFirstHit: 0, halfWeight: true, flatApBonus: 1 }),
});

/* -------------------------------------------------------------------- */
/*  Lookup helpers                                                      */
/* -------------------------------------------------------------------- */

/**
 * Resolve the ranged-weapon Craftsmanship effect for a given tier.
 *
 * Returned objects are the frozen singletons from
 * {@link OW_RANGED_CRAFTSMANSHIP}; callers must not mutate them.
 */
export function getRangedCraftsmanshipEffect(craftsmanship: Craftsmanship): RangedCraftsmanshipEffect {
    return OW_RANGED_CRAFTSMANSHIP[craftsmanship];
}

/**
 * Resolve the melee-weapon Craftsmanship effect for a given tier.
 *
 * Returned objects are the frozen singletons from
 * {@link OW_MELEE_CRAFTSMANSHIP}; callers must not mutate them.
 */
export function getMeleeCraftsmanshipEffect(craftsmanship: Craftsmanship): MeleeCraftsmanshipEffect {
    return OW_MELEE_CRAFTSMANSHIP[craftsmanship];
}

/**
 * Resolve the armour Craftsmanship effect for a given tier.
 *
 * Returned objects are the frozen singletons from
 * {@link OW_ARMOUR_CRAFTSMANSHIP}; callers must not mutate them.
 */
export function getArmourCraftsmanshipEffect(craftsmanship: Craftsmanship): ArmourCraftsmanshipEffect {
    return OW_ARMOUR_CRAFTSMANSHIP[craftsmanship];
}
