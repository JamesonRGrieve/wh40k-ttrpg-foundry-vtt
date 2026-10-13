/**
 * Daemon summoning ritual (DH2 Enemies Beyond p. 59).
 *
 *   1. The ritual itself: a Hellish (−60) Forbidden Lore (Daemonology) test,
 *      +30 when the Daemon's True Name is known, plus GM factors (components,
 *      assistants, the Summoning power's +10 × psy rating, the Daemon's power…).
 *   2. On success the Daemon appears and the summoner makes a Daemonic Mastery
 *      test — opposed Willpower against the Daemon (see `daemonic-mastery.ts`).
 *   3. Winning binds the Daemon for one hour per degree of success; losing
 *      leaves it free to act as it wills.
 *
 * Pure: the caller supplies the d100 results and posts the card.
 */

import { degreesOfFailure, degreesOfSuccess, isD100Success } from './_dice.ts';
import { nonNegInt } from './_num.ts';
import {
    buildDaemonicMasteryTest,
    composeRitualTest,
    DAEMONIC_MASTERY_FACTORS,
    type DaemonicMasteryFactor,
    type RitualTestComposition,
} from './daemonic-mastery.ts';
import { resolveOpposed } from './opposed.ts';

/** Printed modifiers on the summoning Forbidden Lore (Daemonology) test. */
export const SUMMONING_LORE_FACTORS = {
    HELLISH: { id: 'hellish', labelKey: 'WH40K.Daemonology.Factor.Hellish', modifier: -60 },
    TRUE_NAME: { id: 'true-name', labelKey: 'WH40K.Daemonology.Factor.TrueName', modifier: 30 },
} as const satisfies Record<string, DaemonicMasteryFactor>;

export interface SummoningRitualState {
    /** Forbidden Lore (Daemonology) skill total. */
    forbiddenLoreTotal: number;
    /** Summoner's Willpower total for the Daemonic Mastery test. */
    willpowerTotal: number;
    /** Whether the Daemon's True Name is known (+30 to both tests). */
    hasTrueName: boolean;
    /** Whether the summoner serves the Daemon's patron Chaos God (+10 Mastery). */
    servesPatron: boolean;
    /** GM factors on the ritual (Forbidden Lore) test. */
    loreFactors: readonly DaemonicMasteryFactor[];
    /** GM factors on the Daemonic Mastery test. */
    masteryFactors: readonly DaemonicMasteryFactor[];
}

export interface SummoningRitualPrep {
    lore: RitualTestComposition;
    mastery: RitualTestComposition;
}

export function prepareSummoningRitual(state: SummoningRitualState): SummoningRitualPrep {
    const loreFactors: DaemonicMasteryFactor[] = [SUMMONING_LORE_FACTORS.HELLISH];
    if (state.hasTrueName) loreFactors.push(SUMMONING_LORE_FACTORS.TRUE_NAME);
    loreFactors.push(...state.loreFactors);

    const masteryFactors: DaemonicMasteryFactor[] = [];
    if (state.servesPatron) masteryFactors.push(DAEMONIC_MASTERY_FACTORS.PATRON_SERVANT);
    if (state.hasTrueName) masteryFactors.push(DAEMONIC_MASTERY_FACTORS.TRUE_NAME);
    masteryFactors.push(...state.masteryFactors);

    return {
        lore: composeRitualTest(state.forbiddenLoreTotal, loreFactors),
        mastery: buildDaemonicMasteryTest({ willpowerTotal: state.willpowerTotal, factors: masteryFactors }),
    };
}

/** Binding duration in hours: 1 per DoS of the Daemonic Mastery test. */
export function bindingDurationHours(masteryDos: number): number {
    return nonNegInt(masteryDos);
}

/** Outcome of a single d100 test. */
export interface TestOutcome {
    readonly roll: number;
    readonly target: number;
    readonly success: boolean;
    readonly dos: number;
    readonly dof: number;
}

/** Resolve a d100 roll against a target into success and degrees. */
export function resolveTest(roll: number, target: number): TestOutcome {
    const success = isD100Success(roll, target);
    return {
        roll,
        target,
        success,
        dos: success ? Math.max(1, degreesOfSuccess(roll, target)) : 0,
        dof: success ? 0 : Math.max(1, degreesOfFailure(roll, target)),
    };
}

type MasteryWinner = 'summoner' | 'daemon' | 'stalemate';

export interface MasteryContestInput {
    summonerRoll: number;
    summonerTarget: number;
    summonerWillpowerBonus: number;
    daemonRoll: number;
    daemonWillpower: number;
    daemonWillpowerBonus: number;
}

export interface MasteryContestResult {
    readonly summoner: TestOutcome;
    readonly daemon: TestOutcome;
    readonly winner: MasteryWinner;
    /** True only when the summoner won — RAW: anything else leaves the Daemon free. */
    readonly bound: boolean;
    /** Hours of service (1 per summoner DoS) when bound, else 0. */
    readonly boundHours: number;
}

/**
 * Resolve the opposed Daemonic Mastery contest by the core opposed ladder
 * (`opposed.ts`). Both failing is a stalemate (RAW: GM's call to stand or
 * re-roll); the Daemon is only bound when the summoner wins.
 */
export function resolveMasteryContest(input: MasteryContestInput): MasteryContestResult {
    const summoner = resolveTest(input.summonerRoll, input.summonerTarget);
    const daemon = resolveTest(input.daemonRoll, nonNegInt(input.daemonWillpower));
    const result = resolveOpposed(
        { success: summoner.success, dos: summoner.dos, dof: summoner.dof, charBonus: input.summonerWillpowerBonus, roll: summoner.roll },
        { success: daemon.success, dos: daemon.dos, dof: daemon.dof, charBonus: input.daemonWillpowerBonus, roll: daemon.roll },
    );
    const winner: MasteryWinner = result.winner === 'initiator' ? 'summoner' : result.winner === 'target' ? 'daemon' : 'stalemate';
    const bound = winner === 'summoner';
    return { summoner, daemon, winner, bound, boundHours: bound ? bindingDurationHours(summoner.dos) : 0 };
}
