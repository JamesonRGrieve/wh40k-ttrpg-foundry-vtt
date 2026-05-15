/**
 * Daemon summoning ritual (beyond.md p. 59).
 *
 * Three-stage workflow:
 *   1. Hellish (−60) Forbidden Lore (Daemonology) test to perform the
 *      ritual itself.
 *   2. Daemonic Mastery opposed against the daemon's Willpower.
 *   3. Binding duration: 1 hour per DoS of the Daemonic Mastery test.
 *
 * The helpers here resolve each stage's target / duration; the chat-
 * card workflow that drives the player through them lives in a UI
 * follow-up.
 */

import { DAEMONIC_MASTERY_FACTORS, buildDaemonicMasteryTest, type DaemonicMasteryFactor } from './daemonic-mastery';

export interface SummoningRitualState {
    /** Forbidden Lore (Daemonology) skill total. */
    forbiddenLoreTotal: number;
    /** Willpower total for the Daemonic Mastery test. */
    willpowerTotal: number;
    /** Whether the True Name of the daemon is known. */
    hasTrueName: boolean;
    /** Whether proper ritual components were assembled. */
    hasComponents: boolean;
    /** Optional extra Daemonic Mastery factors (consecrated ground, etc.). */
    extraFactors: DaemonicMasteryFactor[];
}

export interface SummoningRitualPrep {
    forbiddenLoreTarget: number;
    daemonicMasteryTarget: number;
    masteryBreakdown: { label: string; value: number }[];
}

export function prepareSummoningRitual(state: SummoningRitualState): SummoningRitualPrep {
    const forbiddenLoreTarget = Math.max(0, Math.trunc(state.forbiddenLoreTotal) - 60);
    const factors: DaemonicMasteryFactor[] = [DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY];
    if (state.hasTrueName) factors.push(DAEMONIC_MASTERY_FACTORS.TRUE_NAME);
    if (state.hasComponents) factors.push(DAEMONIC_MASTERY_FACTORS.PROPER_COMPONENTS);
    else factors.push(DAEMONIC_MASTERY_FACTORS.MISSING_COMPONENTS);
    factors.push(...state.extraFactors);
    const { target: daemonicMasteryTarget, breakdown: masteryBreakdown } = buildDaemonicMasteryTest({
        willpowerTotal: state.willpowerTotal,
        factors,
    });
    return { forbiddenLoreTarget, daemonicMasteryTarget, masteryBreakdown };
}

/** Binding duration in hours: 1 per DoS of the Daemonic Mastery test. */
export function bindingDurationHours(masteryDos: number): number {
    return Math.max(0, Math.trunc(masteryDos));
}
