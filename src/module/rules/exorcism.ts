/**
 * Exorcism ritual (beyond.md p. 70).
 *
 * Exorcism is an Extended Daemonic Mastery test against the possessor.
 * The required DoS is the possessor's Willpower bonus × 2; modifiers
 * from the Exorcism Modifiers table apply per attempt. On completion
 * the host makes a Toughness test to survive the trauma.
 *
 * This module composes the per-attempt Daemonic Mastery target and
 * gives the threshold for the Extended Test ladder (#59). The chat-card
 * workflow that drives the ritual is a follow-up.
 */

import { DAEMONIC_MASTERY_FACTORS, buildDaemonicMasteryTest, type DaemonicMasteryFactor } from './daemonic-mastery';

/** Canonical Exorcism Modifiers table entries (beyond.md p. 70). */
export const EXORCISM_MODIFIERS = {
    SANCTIFIED_GROUND: { label: 'Sanctified Ground', modifier: 20 } satisfies DaemonicMasteryFactor,
    HOLY_RELIC: { label: 'Holy Relic Present', modifier: 10 } satisfies DaemonicMasteryFactor,
    PRIEST_ASSIST: { label: 'Ministorum Priest Assisting', modifier: 10 } satisfies DaemonicMasteryFactor,
    HOST_FIGHTS_BACK: { label: 'Host Fights the Exorcist', modifier: -20 } satisfies DaemonicMasteryFactor,
    NO_RITUAL_TOOLS: { label: 'Missing Ritual Tools', modifier: -20 } satisfies DaemonicMasteryFactor,
} as const;

/** Required cumulative DoS to complete the exorcism. RAW: 2 × daemon WP-bonus. */
export function getExorcismThreshold(possessorWillpowerBonus: number): number {
    return Math.max(1, Math.trunc(possessorWillpowerBonus) * 2);
}

export interface ExorcismAttemptInput {
    exorcistWillpower: number;
    /** Factors applying to this specific attempt. Always includes the BASE_DIFFICULTY. */
    factors: DaemonicMasteryFactor[];
}

/** Compose the per-attempt Daemonic Mastery target for an Exorcism step. */
export function prepareExorcismAttempt(input: ExorcismAttemptInput): { target: number; breakdown: { label: string; value: number }[] } {
    const factors = [DAEMONIC_MASTERY_FACTORS.BASE_DIFFICULTY, ...input.factors];
    return buildDaemonicMasteryTest({ willpowerTotal: input.exorcistWillpower, factors });
}

/** Toughness target for the host to survive a successful exorcism. RAW: −10 per RAW per beyond.md p. 71. */
export function getHostSurvivalTarget(hostToughness: number): number {
    return Math.max(0, Math.trunc(hostToughness) - 10);
}
