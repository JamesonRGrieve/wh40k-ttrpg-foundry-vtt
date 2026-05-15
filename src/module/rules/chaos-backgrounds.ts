/**
 * Within-supplement background + role mechanics (within.md p. 30-37).
 *
 * Provides metadata + mechanical-hook helpers for the four new
 * backgrounds / roles whose behaviour spills outside the standard
 * origin-path stat-grant pattern.
 */

/* -------------------------------------------- */
/*  Mutant background (within.md p. 32)         */
/* -------------------------------------------- */

/** Starting Corruption Points for a Mutant background (vs 0 baseline). */
export const MUTANT_STARTING_CORRUPTION = 10;

/**
 * Twisted Flesh interaction: when an actor with this talent fails a
 * Malignancy test, they may convert the malignancy into a Mutation.
 * Returns whether the conversion is available.
 */
export function canConvertMalignancyToMutation(hasTwistedFleshTalent: boolean): boolean {
    return hasTwistedFleshTalent;
}

/* -------------------------------------------- */
/*  Adepta Sororitas background (within.md p. 30) */
/* -------------------------------------------- */

/**
 * Incorruptible Devotion trait: when the actor would gain Corruption,
 * they may instead gain Insanity at the same rate (1:1 trade). Returns
 * whether the trade is available.
 */
export function canApplyIncorruptibleDevotion(hasIncorruptibleDevotion: boolean): boolean {
    return hasIncorruptibleDevotion;
}

/* -------------------------------------------- */
/*  Fanatic role (within.md p. 34)              */
/* -------------------------------------------- */

/** Fate-spend bonus duration in rounds for "Death to All Who Oppose Me". */
export const DEATH_TO_OPPOSE_DURATION_ROUNDS = 5;

/* -------------------------------------------- */
/*  Penitent role (within.md p. 36)             */
/* -------------------------------------------- */

/**
 * Mortification of the Flesh: self-inflict N Fatigue to gain
 * +10 to all WP tests (Fear/Pinning/Psychic/Corruption) for one hour.
 * Returns the (fatigueCost, wpBonus, durationRounds) tuple.
 */
export interface MortificationEffect {
    fatigueCost: number;
    wpBonus: number;
    durationRounds: number;
}

export const MORTIFICATION_OF_THE_FLESH: MortificationEffect = {
    fatigueCost: 1,
    wpBonus: 10,
    durationRounds: 60, // ~1 hour at 1 round = 1 minute (DH2 narrative pace)
};
