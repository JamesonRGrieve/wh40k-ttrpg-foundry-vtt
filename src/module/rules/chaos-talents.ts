/**
 * Within-supplement talents with novel mechanics (within.md p. 57-58).
 *
 * Each entry exposes the per-talent constants the engine consumer
 * needs. The talent items themselves are compendium content; this
 * module is the canonical source for the numbers / predicate shapes
 * so the talent's `effect` can stay i18n-clean text and the engine
 * pulls the values from here.
 */

/* Aegis of Contempt — Corruption-reduction aura. */
export const AEGIS_OF_CONTEMPT = {
    radiusMetres: 10,
    corruptionReduction: 1, // per Corruption-gain event
};

/* Indomitable Conviction — Insanity-reduction aura (mirror of Aegis). */
export const INDOMITABLE_CONVICTION = {
    radiusMetres: 10,
    insanityReduction: 1,
};

/* Into the Jaws of Hell — Fellowship subtracts from ally Pinning/Fear DoF. */
export const INTO_THE_JAWS_OF_HELL = {
    radiusMetres: 10,
    // Caller subtracts (owner.fellowship.bonus) from the ally's DoF.
};

/* Divine Protection — Spray weapons cannot harm allies. */
export const DIVINE_PROTECTION = {
    requiresBS: 45,
    requiresWP: 35,
};

/* Flagellant — self-Fatigue Full Action for +10 WP tests for 1 hour. */
export const FLAGELLANT = {
    fatigueCostFormula: '1d5-2', // RAW dice formula; caller rolls.
    wpBonus: 10,
    durationRounds: 60,
};

/* Mounted Warrior — reduces vehicle/mount attack penalties. */
export const MOUNTED_WARRIOR = {
    penaltyReductionPerRank: 10,
};

/* Penitent Psyker — psychic-power reaction interception. Caller emits the Fatigue cost. */
export const PENITENT_PSYKER = {
    allyResistanceBonus: 10,
    /** When the focus power's roll has doubles, the intercepting psyker triggers Phenomena. */
    triggersPhenomenaOnDoubles: true,
};

/* Purity of Hatred — adds Vengeful (9) on Hatred targets, or reduces existing Vengeful by 1. */
export const PURITY_OF_HATRED = {
    grantedVengefulThreshold: 9,
};

/* Tainted Psyker — voluntary Corruption-up-to-PR + Phenomena modifier. */
export const TAINTED_PSYKER = {
    /** +X test target per CP voluntarily taken. */
    testBonusPerCp: 10,
    /** Phenomena roll modifier per CP voluntarily taken. */
    phenomenaModifierPerCp: 5,
};

/* Witch Finder — non-psyker Psyniscience grant. */
export const WITCH_FINDER = {
    pseudoSkillRank: 1,
};
