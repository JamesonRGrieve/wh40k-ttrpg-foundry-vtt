/**
 * Drugs and Addiction tests (#122 — core.md L7530-7630).
 *
 * Each use of a drug-class item with an addictive rating triggers a
 * Willpower test (target = WP − substance rating). On failure, the
 * actor's Addiction tier escalates and the treatment clock extends.
 *
 * This module exposes the pure resolver. The consume hook on drug
 * items, the actor schema field for addiction state, and the sheet
 * surface remain follow-ups under #122 and #75.
 */

import { stepLadder } from './_ladder.ts';

export type AddictionTier = 'none' | 'mild' | 'moderate' | 'severe';

/**
 * Treatment clock in (RAW abstract) days per tier. Severe addiction
 * requires extended-care narrative resolution per RAW; the engine
 * surface here just exposes the clock magnitude for sheet display.
 */
export const ADDICTION_TREATMENT_DAYS: Record<AddictionTier, number> = {
    none: 0,
    mild: 7,
    moderate: 30,
    severe: 90,
};

const TIER_ORDER: readonly AddictionTier[] = ['none', 'mild', 'moderate', 'severe'];

export interface AddictionCheckInput {
    /** Actor's full Willpower characteristic total. */
    willpowerTotal: number;
    /** Substance addictive rating (per-drug constant; higher = harder). */
    substanceRating: number;
    /** The actor's current Addiction tier for this substance. */
    currentTier: AddictionTier;
}

export interface AddictionCheckResult {
    /** Effective Willpower target for the addiction test. */
    target: number;
    /**
     * The tier the actor escalates to on a failed test. Mild → Moderate →
     * Severe; never demotes. A successful test leaves `currentTier`
     * unchanged (caller may demote via separate treatment workflow).
     */
    nextTierOnFailure: AddictionTier;
}

/**
 * Compose the addiction-test target + escalation outcome.
 *
 * The target is the actor's Willpower reduced by the substance's
 * addictive rating, floored at 0. The escalation is one tier per
 * failure (none → mild → moderate → severe, capped at severe).
 */
export function resolveAddictionCheck(input: AddictionCheckInput): AddictionCheckResult {
    const wp = Math.max(0, Math.trunc(input.willpowerTotal));
    const rating = Math.max(0, Math.trunc(input.substanceRating));
    const target = Math.max(0, wp - rating);

    // One tier worse per failure, clamped at the top of the ladder (severe).
    const nextTier = stepLadder(TIER_ORDER, input.currentTier, 1);

    return { target, nextTierOnFailure: nextTier };
}

/** Treatment-clock days for a tier (helper for sheet display). */
export function getTreatmentClockDays(tier: AddictionTier): number {
    return ADDICTION_TREATMENT_DAYS[tier];
}
