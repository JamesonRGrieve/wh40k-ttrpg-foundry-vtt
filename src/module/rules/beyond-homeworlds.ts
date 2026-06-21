/**
 * Beyond-supplement new home-world riders (beyond.md p. 26-31).
 *
 * Three new home-worlds — Daemon World, Penal Colony, Quarantine World.
 * Per Direction #7 (#338), the basic mechanical VALUES (characteristic
 * modifiers, Fate threshold, starting wounds, aptitude, the named
 * home-world bonus) are authored once in the compendium pack
 * `dh2-beyond-origins-homeworlds` and read at render time via
 * `src/module/rules/homeworld-compendium.ts`. This registry keeps ONLY
 * the supplement-specific data the compendium does not carry: the
 * structured riders plus the key-talent / recommended-background /
 * mechanical-hook prose, and the `compendiumId` that joins each entry to
 * its `originPath` document.
 *
 * Quarantine World's "Secretive by Nature" hook composes with the
 * subtlety-adjuster pipeline (`src/module/rules/subtlety-adjusters.ts`)
 * documented under audit issue #197: any warband-subtlety decrease is
 * clamped down by 2 (minimum reduction of 1). This registry only
 * declares the rider — wiring lives in the adjuster pipeline.
 *
 * See GitHub issue #140.
 */

import { type HomeworldDefBase, lookupById } from './homeworlds-common.ts';

/* -------------------------------------------- */
/*  Types                                       */
/* -------------------------------------------- */

/** Starting-Corruption rider (Daemon World only). */
interface BeyondCorruptionRider {
    readonly base: number;
    readonly dieFaces: number;
}

/** Subtlety-decrease clamp (Quarantine World only). */
interface BeyondSubtletyClamp {
    /** Amount the decrease is reduced by. */
    readonly reducedBy: number;
    /** Floor on the actual reduction applied. */
    readonly minimumReduction: number;
}

export interface BeyondHomeworldDef extends HomeworldDefBase {
    readonly id: 'daemonWorld' | 'penalColony' | 'quarantineWorld';
    /** Compendium `system.identifier` (kebab-case) joining this entry to its `originPath` doc. */
    readonly compendiumId: string;
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
 * Compendium basics: +WP, +Per, -Fel. Fate 3 / Emperor's Blessing on 4+.
 * Wounds 7+1d5. Willpower aptitude. "Touched by the Warp": one rank in
 * Psyniscience; cannot purchase more without the Psyker aptitude. Starts
 * with 1d10+5 Corruption.
 */
const DAEMON_WORLD: BeyondHomeworldDef = {
    id: 'daemonWorld',
    compendiumId: 'daemon-world',
    label: 'WH40K.BeyondHomeworld.DaemonWorld',
    keyTalents: ['Touched by the Warp (Psyniscience rank 1)'],
    recommendedBackgrounds: ['Adeptus Astra Telepathica', 'Adeptus Ministorum', 'Exorcised', 'Outcast'],
    mechanicalHook: 'Begins with one rank in Psyniscience (cannot be increased without the Psyker aptitude) and 1d10+5 starting Corruption Points.',
    corruptionRider: { base: 5, dieFaces: 10 },
};

/**
 * Penal Colony (beyond.md p. 28-29).
 *
 * Compendium basics: +T, +Per, -Inf. Fate 3 / Emperor's Blessing on 8+.
 * Wounds 10+1d5. Toughness aptitude. "Finger on the Pulse": rank 1 in
 * Common Lore (Underworld) and Scrutiny, plus the Peer (Criminal Cartels)
 * talent.
 */
const PENAL_COLONY: BeyondHomeworldDef = {
    id: 'penalColony',
    compendiumId: 'penal-colony',
    label: 'WH40K.BeyondHomeworld.PenalColony',
    keyTalents: ['Common Lore (Underworld) rank 1', 'Scrutiny rank 1', 'Peer (Criminal Cartels)'],
    recommendedBackgrounds: ['Adeptus Administratum', 'Adeptus Ministorum', 'Imperial Guard', 'Outcast'],
    mechanicalHook: 'Finger on the Pulse: begins with rank 1 in Common Lore (Underworld) and Scrutiny, and the Peer (Criminal Cartels) talent.',
};

/**
 * Quarantine World (beyond.md p. 30-31).
 *
 * Compendium basics: +BS, +Int, -S. Fate 3 / Emperor's Blessing on 9+.
 * Wounds 8+1d5. Fieldcraft aptitude. "Secretive by Nature": whenever
 * warband Subtlety would decrease, it decreases by 2 less (minimum
 * reduction of 1) — composes with the subtlety-adjuster pipeline from
 * issue #197.
 */
const QUARANTINE_WORLD: BeyondHomeworldDef = {
    id: 'quarantineWorld',
    compendiumId: 'quarantine-world',
    label: 'WH40K.BeyondHomeworld.QuarantineWorld',
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
    return lookupById(BEYOND_HOMEWORLDS, id);
}

/** Ordered list of definitions, suitable for rendering as cards in a UI. */
export function listBeyondHomeworlds(): readonly BeyondHomeworldDef[] {
    return [DAEMON_WORLD, PENAL_COLONY, QUARANTINE_WORLD];
}
