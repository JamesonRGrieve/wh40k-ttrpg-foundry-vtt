/**
 * Without-supplement engine constants.
 *
 * Ace role, novel-mechanic talents, and the three new homeworlds whose
 * traits carry non-stat behaviour. Sister file to `chaos-talents.ts`
 * (Within) and `chaos-backgrounds.ts` — each constant is the canonical
 * source for the talent / trait's mechanical numbers.
 */

/* -------------------------------------------- */
/*  Ace role (without.md p. 48)                 */
/* -------------------------------------------- */

/** Right Stuff Fate spend: auto-succeed on Operate/Survival with DoS = AgB. */
export const RIGHT_STUFF = {
    applicableSkills: ['operate', 'survival'] as const,
};

/* -------------------------------------------- */
/*  Without novel-mechanic talents (#101)       */
/* -------------------------------------------- */

/** Field Vivisection — Medicae instead of WS/BS for Called Shot vs studied xenos. */
export const FIELD_VIVISECTION = {
    alternateSkill: 'medicae' as const,
    /** Requires Forbidden Lore (Xenos) at trained or better. */
    requiresForbiddenLore: true,
};

/** Hotshot Pilot — trade Fatigue on Operate for +DoS or reduced failure. */
export const HOTSHOT_PILOT = {
    fatigueCost: 1,
};

/** Hull Down — vehicle Size counts as 1 lower for attack & cover during Movement actions. */
export const HULL_DOWN = {
    sizeReduction: 1,
};

/** Leaping Dodge — use Dodge skill (not raw Ag) against Spray quality. */
export const LEAPING_DODGE = {
    sprayAvoidanceSkill: 'dodge' as const,
};

/** Push the Limit — +20 Operate once/round; 4+ DoF triggers a motive-systems critical. */
export const PUSH_THE_LIMIT = {
    operateBonus: 20,
    failureThresholdForCritical: 4, // DoF
};

/* -------------------------------------------- */
/*  Without homeworld traits (#102)             */
/* -------------------------------------------- */

/** Survivor's Paranoia (Death World) — negates +30 BS/WS from Surprised attackers. */
export const SURVIVORS_PARANOIA = {
    negatedSurpriseBonus: 30,
};

/** Serenity of the Green (Garden World) — halves Shock/Trauma duration; cheaper Insanity recovery. */
export const SERENITY_OF_THE_GREEN = {
    shockDurationMultiplier: 0.5,
    insanityRecoveryXpCost: 50, // vs 100 baseline
};

/** Scholarly Discipline (Research Station) — once-per-session reroll on Scholastic Lore. */
export const SCHOLARLY_DISCIPLINE = {
    rerollsPerSession: 1,
    applicableSkill: 'scholasticLore' as const,
};
