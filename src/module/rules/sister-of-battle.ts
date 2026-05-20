/**
 * Sister of Battle elite-advance talents (within.md L1070-1074; #134).
 *
 * Each constant exposes the per-talent numbers the engine consumer
 * needs. Talent items are compendium content; this module is the
 * canonical source for the mechanical riders so talent `effect` text
 * can stay i18n-clean prose and downstream consumers pull values
 * here.
 */

export interface SisterOfBattleTalent {
    /** Stable identifier used by chat cards + dialog wiring. */
    readonly id: string;
    /** i18n key for the player-facing label. */
    readonly label: string;
    /** i18n key for the summary line shown in the dialog + chat card. */
    readonly summary: string;
    /** WS bonus, when the talent grants one. */
    readonly wsBonus?: number;
    /** WP bonus, when the talent grants one (e.g. vs psychic powers). */
    readonly wpBonus?: number;
    /** Bonus to Fear tests, when the talent grants one. */
    readonly fearBonus?: number;
    /** Daemonic-source damage reduction dice expression (e.g. "1d10"). */
    readonly daemonReduction?: string;
}

/** +10 WP vs psychic powers. */
export const FAITH_OF_THE_EMPEROR: SisterOfBattleTalent = {
    id: 'faith-of-the-emperor',
    label: 'WH40K.SisterOfBattle.FaithOfEmperor',
    summary: 'WH40K.SisterOfBattle.FaithOfEmperorSummary',
    wpBonus: 10,
};

/** Ignore 1d10 daemonic-source damage once per round. */
export const HOLY_AEGIS: SisterOfBattleTalent = {
    id: 'holy-aegis',
    label: 'WH40K.SisterOfBattle.HolyAegis',
    summary: 'WH40K.SisterOfBattle.HolyAegisSummary',
    daemonReduction: '1d10',
};

/** +20 to Fear tests. */
export const SISTERS_RESOLVE: SisterOfBattleTalent = {
    id: 'sisters-resolve',
    label: 'WH40K.SisterOfBattle.SistersResolve',
    summary: 'WH40K.SisterOfBattle.SistersResolveSummary',
    fearBonus: 20,
};

/** Display order for the dialog + chat card grants list. */
export const SISTER_OF_BATTLE_TALENTS: readonly SisterOfBattleTalent[] = [FAITH_OF_THE_EMPEROR, HOLY_AEGIS, SISTERS_RESOLVE] as const;
