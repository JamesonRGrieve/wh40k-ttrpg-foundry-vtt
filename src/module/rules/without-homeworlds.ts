/**
 * Without-supplement new home-world traits (without.md p. 27-32).
 *
 * Three new home-worlds — Death World, Garden World, Research Station —
 * each provides characteristic modifiers, a Fate-threshold tuple, a wounds
 * starting value, an aptitude, a list of key talents / skills, and a
 * mechanical-hook description that runtime systems consume.
 *
 *   - Death World's "Survivor's Paranoia" hook composes with the surprise
 *     attack pipeline: while the death-world character is Surprised,
 *     non-Surprised attackers do NOT gain the standard +30 bonus to
 *     Weapon Skill and Ballistic Skill tests against them.
 *   - Garden World's "Serenity of the Green" hook composes with the
 *     Shock / Mental Trauma duration logic (Tables 8-11 / 8-13): the
 *     character halves the duration (rounded up), and the XP cost to
 *     remove Insanity points drops from 100 to 50 per point.
 *   - Research Station's "Pursuit of Data" hook composes with the
 *     scholastic-lore advancement pipeline: whenever the character
 *     reaches Rank 2 (Trained) in a Scholastic Lore skill, they gain
 *     Rank 1 (Known) in one related or identical Forbidden Lore skill
 *     specialisation of their choice (GM is final arbiter of
 *     relatedness).
 *
 * This registry only declares the riders — runtime wiring lives in the
 * relevant sibling pipelines.
 *
 * See GitHub issue #102.
 */

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

/** Characteristic-mod tuple keyed by canonical DH2 characteristic id. */
interface WithoutCharacteristicMods {
    readonly bonuses: readonly string[];
    readonly penalties: readonly string[];
}

/** Fate-threshold rule: base value + Emperor's Blessing trigger (`d10 >= N`). */
interface WithoutFateThreshold {
    readonly base: number;
    readonly emperorsBlessing: number;
}

/** Starting wounds — Without home-worlds use `<base> + 1d5` form. */
interface WithoutWounds {
    readonly base: number;
    /** Always a d5 in Without. Kept as a field so future tables can vary. */
    readonly dieFaces: 5;
}

/** Surprise-attack bonus suppression rider (Death World only). */
interface WithoutSurpriseBonusSuppression {
    /** The numeric WS/BS bonus that non-Surprised attackers normally gain. */
    readonly suppressedBonus: number;
    /** The skills the bonus targets when the rider is active. */
    readonly affectedSkills: readonly ('weaponSkill' | 'ballisticSkill')[];
}

/** Shock / Mental Trauma duration + Insanity XP rider (Garden World only). */
interface WithoutSerenityRider {
    /** Multiplier applied to Shock / Mental Trauma durations (0.5 = halved). */
    readonly durationMultiplier: number;
    /** Rounding direction for the multiplied duration. */
    readonly rounding: 'up' | 'down';
    /** XP cost (per point) to remove Insanity points under this rider. */
    readonly insanityRemovalCost: number;
    /** Baseline XP cost (per point) for reference / regression-pinning. */
    readonly baselineInsanityRemovalCost: number;
}

/** Scholastic Lore -> Forbidden Lore advancement rider (Research Station only). */
interface WithoutPursuitOfDataRider {
    /** Scholastic Lore rank at which the rider fires (Rank 2 = Trained). */
    readonly triggerScholasticRank: number;
    /** Forbidden Lore rank granted (Rank 1 = Known). */
    readonly grantedForbiddenRank: number;
    /** Whether the granted specialisation must be related to the trigger. */
    readonly requiresRelatedSpecialisation: boolean;
}

export interface WithoutHomeworldDef {
    readonly id: 'deathWorld' | 'gardenWorld' | 'researchStation';
    readonly label: string;
    readonly characteristicMods: WithoutCharacteristicMods;
    readonly fateThreshold: WithoutFateThreshold;
    readonly wounds: WithoutWounds;
    readonly aptitude: string;
    /** Key talents and skills granted at character creation. */
    readonly keyTalents: readonly string[];
    /** Recommended backgrounds per RAW. */
    readonly recommendedBackgrounds: readonly string[];
    /** Human-readable mechanical hook (also drives the GM info dialog body). */
    readonly mechanicalHook: string;
    /** Surprise-bonus suppression rider (Death World only). */
    readonly surpriseBonusSuppression?: WithoutSurpriseBonusSuppression;
    /** Shock / Trauma + Insanity rider (Garden World only). */
    readonly serenityRider?: WithoutSerenityRider;
    /** Scholastic-Lore advancement rider (Research Station only). */
    readonly pursuitOfDataRider?: WithoutPursuitOfDataRider;
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

/**
 * Death World (without.md p. 27-28).
 *
 * +Ag, +Per, -Fel. Fate 2 / Emperor's Blessing on 5+. Wounds 9+1d5.
 * "Survivor's Paranoia": while a death-world character is Surprised,
 * non-Surprised attackers do not gain the normal +30 bonus to their
 * Weapon Skill and Ballistic Skill tests when targeting them.
 */
const DEATH_WORLD: WithoutHomeworldDef = {
    id: 'deathWorld',
    label: 'WH40K.WithoutHomeworld.DeathWorld',
    characteristicMods: {
        bonuses: ['agility', 'perception'],
        penalties: ['fellowship'],
    },
    fateThreshold: { base: 2, emperorsBlessing: 5 },
    wounds: { base: 9, dieFaces: 5 },
    aptitude: 'Fieldcraft',
    keyTalents: ["Survivor's Paranoia (suppresses Surprised +30 WS/BS bonus)"],
    recommendedBackgrounds: ['Adeptus Arbites', 'Adeptus Mechanicus', 'Adeptus Ministorum', 'Imperial Guard'],
    mechanicalHook:
        "Survivor's Paranoia: while the death-world character is Surprised, non-Surprised attackers do not gain the standard +30 bonus to Weapon Skill and Ballistic Skill tests against them.",
    surpriseBonusSuppression: {
        suppressedBonus: 30,
        affectedSkills: ['weaponSkill', 'ballisticSkill'],
    },
};

/**
 * Garden World (without.md p. 29-30).
 *
 * +Fel, +Ag, -T. Fate 2 / Emperor's Blessing on 4+. Wounds 7+1d5.
 * "Serenity of the Green": halves (rounded up) the duration of any
 * Shock or Mental Trauma result, and the XP cost to remove Insanity
 * points drops from 100 to 50 per point.
 */
const GARDEN_WORLD: WithoutHomeworldDef = {
    id: 'gardenWorld',
    label: 'WH40K.WithoutHomeworld.GardenWorld',
    characteristicMods: {
        bonuses: ['fellowship', 'agility'],
        penalties: ['toughness'],
    },
    fateThreshold: { base: 2, emperorsBlessing: 4 },
    wounds: { base: 7, dieFaces: 5 },
    aptitude: 'Social',
    keyTalents: ['Serenity of the Green (Shock/Trauma halved, Insanity removal 50xp)'],
    recommendedBackgrounds: ['Adeptus Administratum', 'Adeptus Astra Telepathica', 'Adeptus Ministorum', 'Rogue Trader Fleet'],
    mechanicalHook:
        'Serenity of the Green: halves (rounded up) the duration of any Shock or Mental Trauma result, and Insanity points may be removed for 50 XP per point instead of the standard 100.',
    serenityRider: {
        durationMultiplier: 0.5,
        rounding: 'up',
        insanityRemovalCost: 50,
        baselineInsanityRemovalCost: 100,
    },
};

/**
 * Research Station (without.md p. 31-32).
 *
 * +Int, +Per, -Fel. Fate 3 / Emperor's Blessing on 8+. Wounds 8+1d5.
 * "Pursuit of Data": whenever the character reaches Rank 2 (Trained)
 * in a Scholastic Lore skill, they also gain Rank 1 (Known) in one
 * related or identical Forbidden Lore specialisation of their choice
 * (GM is final arbiter of relatedness).
 */
const RESEARCH_STATION: WithoutHomeworldDef = {
    id: 'researchStation',
    label: 'WH40K.WithoutHomeworld.ResearchStation',
    characteristicMods: {
        bonuses: ['intelligence', 'perception'],
        penalties: ['fellowship'],
    },
    fateThreshold: { base: 3, emperorsBlessing: 8 },
    wounds: { base: 8, dieFaces: 5 },
    aptitude: 'Knowledge',
    keyTalents: ['Pursuit of Data (Scholastic Lore Rank 2 grants Forbidden Lore Rank 1)'],
    recommendedBackgrounds: ['Adeptus Administratum', 'Adeptus Astra Telepathica', 'Adeptus Mechanicus', 'Mutant'],
    mechanicalHook:
        'Pursuit of Data: whenever the character reaches Rank 2 (Trained) in a Scholastic Lore skill, they gain Rank 1 (Known) in one related or identical Forbidden Lore specialisation of their choice. The GM is the final arbiter of relatedness.',
    pursuitOfDataRider: {
        triggerScholasticRank: 2,
        grantedForbiddenRank: 1,
        requiresRelatedSpecialisation: true,
    },
};

/**
 * Typed registry of the three new Without home-worlds. Keys are stable
 * camelCase ids matching `WithoutHomeworldDef.id`; do not rename without
 * migrating origin-path / pack consumers in lockstep.
 */
export const WITHOUT_HOMEWORLDS: Record<WithoutHomeworldDef['id'], WithoutHomeworldDef> = {
    deathWorld: DEATH_WORLD,
    gardenWorld: GARDEN_WORLD,
    researchStation: RESEARCH_STATION,
};

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Look up a Without home-world definition by id, returning undefined when unknown. */
export function getWithoutHomeworld(id: string): WithoutHomeworldDef | undefined {
    return Object.hasOwn(WITHOUT_HOMEWORLDS, id) ? WITHOUT_HOMEWORLDS[id as WithoutHomeworldDef['id']] : undefined;
}

/** Ordered list of definitions, suitable for rendering as cards in a UI. */
export function listWithoutHomeworlds(): readonly WithoutHomeworldDef[] {
    return [DEATH_WORLD, GARDEN_WORLD, RESEARCH_STATION];
}
