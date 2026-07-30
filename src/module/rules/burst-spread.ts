/**
 * @file Which targets a burst's extra hits may be moved onto (#513).
 *
 * DH2 core ch. VII, Semi-Auto Burst (Full Auto Burst is worded identically):
 *
 *   "Extra hits can either be allocated to the original target or any other
 *    targets within two metres, provided none of the new targets would have been
 *    harder to hit than the original target."
 *
 * Two constraints, and the second is the subtle one. "Harder to hit" is not about
 * the target's defences — it is about the ATTACK TEST modifiers that target would
 * have imposed. A smaller enemy is harder to hit; a further one is harder to hit.
 * So a candidate qualifies only when the modifiers it would have contributed are
 * no worse than the declared target's.
 *
 * Pure: no Foundry globals, no canvas reads. The caller measures distances and
 * resolves each candidate's modifiers; this decides eligibility. Keeping the rule
 * separable is what lets it be tested at all — the canvas half cannot be.
 */

import type { AllocationTarget } from './hit-allocation.ts';

/** RAW's radius, in metres, around the declared target. */
export const SPREAD_RADIUS_METRES = 2;

/** A candidate target with the attack-test modifiers it would have imposed. */
export interface SpreadCandidate extends AllocationTarget {
    /**
     * Distance from the DECLARED target, in metres — not from the attacker. RAW
     * measures the spread radius around the original target.
     */
    metresFromOriginal: number;
    /**
     * Total to-hit modifier this target would have imposed (size, range, cover…).
     * Higher is easier. Compared against the declared target's, never used raw.
     */
    toHitModifier: number;
}

/** Inputs to {@link eligibleSpreadTargets}. */
export interface SpreadInput {
    /** The declared target's own to-hit modifier — the bar every candidate must clear. */
    readonly originalToHitModifier: number;
    /** Every other token in play, already excluding the declared target itself. */
    readonly candidates: readonly SpreadCandidate[];
}

/**
 * Filter candidates to those RAW permits a burst's extra hits to be moved onto.
 *
 * Excluded: anything beyond {@link SPREAD_RADIUS_METRES} of the declared target,
 * and anything that would have been harder to hit than it.
 *
 * Note the comparison is `>=`, not `>`: a target equally hard to hit is allowed,
 * since RAW forbids only targets that "would have been HARDER to hit". Using `>`
 * would silently exclude the commonest case — a second identical enemy standing
 * beside the first.
 * @param {SpreadInput} input  The declared target's bar and the candidate list.
 * @returns {AllocationTarget[]}  Eligible targets, nearest first, ready for `allocateHits`.
 */
export function eligibleSpreadTargets(input: SpreadInput): AllocationTarget[] {
    return (
        input.candidates
            .filter((c) => Number.isFinite(c.metresFromOriginal) && c.metresFromOriginal <= SPREAD_RADIUS_METRES)
            .filter((c) => c.toHitModifier >= input.originalToHitModifier)
            // Nearest first so the round-robin fills the closest enemies before the
            // furthest, which is what a player picking by hand would do.
            .sort((a, b) => a.metresFromOriginal - b.metresFromOriginal)
            .map((c) => ({ id: c.id, name: c.name }))
    );
}
