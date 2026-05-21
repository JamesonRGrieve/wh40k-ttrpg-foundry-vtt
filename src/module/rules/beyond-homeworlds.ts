/**
 * Beyond-supplement new home-world traits (beyond.md p. 26-31).
 *
 * Three new home-worlds — Daemon World, Penal Colony, Quarantine World —
 * each provides characteristic modifiers, a Fate-threshold tuple, a wounds
 * starting value, an aptitude, a list of key talents / skills, and a
 * mechanical-hook description that runtime systems consume.
 *
 * Quarantine World's "Secretive by Nature" hook composes with the
 * subtlety-adjuster pipeline (`src/module/rules/subtlety-adjusters.ts`)
 * documented under audit issue #197: any warband-subtlety decrease is
 * clamped down by 2 (minimum reduction of 1). This registry only
 * declares the rider — wiring lives in the adjuster pipeline.
 *
 * See GitHub issue #140.
 */

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

/** Characteristic-mod tuple keyed by canonical DH2 characteristic id. */
export interface BeyondCharacteristicMods {
    readonly bonuses: readonly string[];
    readonly penalties: readonly string[];
}

/** Fate-threshold rule: base value + Emperor's Blessing trigger (`d10 >= N`). */
export interface BeyondFateThreshold {
    readonly base: number;
    readonly emperorsBlessing: number;
}

/** Starting wounds — Beyond home-worlds use `<base> + 1d5` form. */
export interface BeyondWounds {
    readonly base: number;
    /** Always a d5 in Beyond. Kept as a field so future tables can vary. */
    readonly dieFaces: 5;
}

/** Starting-Corruption rider (Daemon World only). */
export interface BeyondCorruptionRider {
    readonly base: number;
    readonly dieFaces: number;
}

/** Subtlety-decrease clamp (Quarantine World only). */
export interface BeyondSubtletyClamp {
    /** Amount the decrease is reduced by. */
    readonly reducedBy: number;
    /** Floor on the actual reduction applied. */
    readonly minimumReduction: number;
}

export interface BeyondHomeworldDef {
    readonly id: 'daemonWorld' | 'penalColony' | 'quarantineWorld';
    readonly label: string;
    readonly characteristicMods: BeyondCharacteristicMods;
    readonly fateThreshold: BeyondFateThreshold;
    readonly wounds: BeyondWounds;
    readonly aptitude: string;
    /** Key talents and skills granted at character creation. */
    readonly keyTalents: readonly string[];
    /** Recommended backgrounds per RAW. */
    readonly recommendedBackgrounds: readonly string[];
    /** Human-readable mechanical hook (also drives the GM info dialog body). */
    readonly mechanicalHook: string;
    /** Starting-Corruption rider (Daemon World only). */
    readonly corruptionRider?: BeyondCorruptionRider;
    /** Subtlety-decrease clamp (Quarantine World only — composes with #197). */
    readonly subtletyClamp?: BeyondSubtletyClamp;
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

/**
 * Daemon World (beyond.md p. 26-27).
 *
 * +WP, +Per, -Fel. Fate 3 / Emperor's Blessing on 4+. Wounds 7+1d5.
 * "Touched by the Warp": one rank in Psyniscience; cannot purchase
 * more without the Psyker aptitude. Starts with 1d10+5 Corruption.
 */
const DAEMON_WORLD: BeyondHomeworldDef = {
    id: 'daemonWorld',
    label: 'WH40K.BeyondHomeworld.DaemonWorld',
    characteristicMods: {
        bonuses: ['willpower', 'perception'],
        penalties: ['fellowship'],
    },
    fateThreshold: { base: 3, emperorsBlessing: 4 },
    wounds: { base: 7, dieFaces: 5 },
    aptitude: 'Willpower',
    keyTalents: ['Touched by the Warp (Psyniscience rank 1)'],
    recommendedBackgrounds: ['Adeptus Astra Telepathica', 'Adeptus Ministorum', 'Exorcised', 'Outcast'],
    mechanicalHook: 'Begins with one rank in Psyniscience (cannot be increased without the Psyker aptitude) and 1d10+5 starting Corruption Points.',
    corruptionRider: { base: 5, dieFaces: 10 },
};

/**
 * Penal Colony (beyond.md p. 28-29).
 *
 * +T, +Per, -Inf. Fate 3 / Emperor's Blessing on 8+. Wounds 10+1d5.
 * "Finger on the Pulse": rank 1 in Common Lore (Underworld) and
 * Scrutiny, plus the Peer (Criminal Cartels) talent.
 */
const PENAL_COLONY: BeyondHomeworldDef = {
    id: 'penalColony',
    label: 'WH40K.BeyondHomeworld.PenalColony',
    characteristicMods: {
        bonuses: ['toughness', 'perception'],
        penalties: ['influence'],
    },
    fateThreshold: { base: 3, emperorsBlessing: 8 },
    wounds: { base: 10, dieFaces: 5 },
    aptitude: 'Toughness',
    keyTalents: ['Common Lore (Underworld) rank 1', 'Scrutiny rank 1', 'Peer (Criminal Cartels)'],
    recommendedBackgrounds: ['Adeptus Administratum', 'Adeptus Ministorum', 'Imperial Guard', 'Outcast'],
    mechanicalHook: 'Finger on the Pulse: begins with rank 1 in Common Lore (Underworld) and Scrutiny, and the Peer (Criminal Cartels) talent.',
};

/**
 * Quarantine World (beyond.md p. 30-31).
 *
 * +BS, +Int, -S. Fate 3 / Emperor's Blessing on 9+. Wounds 8+1d5.
 * "Secretive by Nature": whenever warband Subtlety would decrease,
 * it decreases by 2 less (minimum reduction of 1) — composes with
 * the subtlety-adjuster pipeline from issue #197.
 */
const QUARANTINE_WORLD: BeyondHomeworldDef = {
    id: 'quarantineWorld',
    label: 'WH40K.BeyondHomeworld.QuarantineWorld',
    characteristicMods: {
        bonuses: ['ballisticSkill', 'intelligence'],
        penalties: ['strength'],
    },
    fateThreshold: { base: 3, emperorsBlessing: 9 },
    wounds: { base: 8, dieFaces: 5 },
    aptitude: 'Fieldcraft',
    keyTalents: ['Secretive by Nature (Subtlety decrease clamp)'],
    recommendedBackgrounds: ['Adeptus Arbites', 'Adeptus Mechanicus', 'Imperial Guard', 'Outcast'],
    mechanicalHook:
        'Secretive by Nature: any warband-Subtlety decrease is reduced by 2 (minimum reduction of 1). Composes with the contamination / mutation rider on Quarantine World natives.',
    subtletyClamp: { reducedBy: 2, minimumReduction: 1 },
};

/**
 * Typed registry of the three new Beyond home-worlds. Keys are stable
 * camelCase ids matching `BeyondHomeworldDef.id`; do not rename without
 * migrating origin-path / pack consumers in lockstep.
 */
export const BEYOND_HOMEWORLDS: Record<BeyondHomeworldDef['id'], BeyondHomeworldDef> = {
    daemonWorld: DAEMON_WORLD,
    penalColony: PENAL_COLONY,
    quarantineWorld: QUARANTINE_WORLD,
};

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

/** Look up a Beyond home-world definition by id, returning undefined when unknown. */
export function getBeyondHomeworld(id: string): BeyondHomeworldDef | undefined {
    return Object.hasOwn(BEYOND_HOMEWORLDS, id) ? BEYOND_HOMEWORLDS[id as BeyondHomeworldDef['id']] : undefined;
}

/** Ordered list of definitions, suitable for rendering as cards in a UI. */
export function listBeyondHomeworlds(): readonly BeyondHomeworldDef[] {
    return [DAEMON_WORLD, PENAL_COLONY, QUARANTINE_WORLD];
}
