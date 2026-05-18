/**
 * Surprise + Surprised round mechanics (#113 — core.md L9940-9954).
 *
 * Surprised combatants:
 *   - Lose their round 1 turn entirely.
 *   - Cannot use Reactions during round 1.
 *   - Attackers gain +30 WS / BS against them.
 *
 * The condition expires at the start of round 2.
 *
 * Pure helpers — combat-tracker hook + condition-application + GM
 * encounter-setup dialog remain follow-up scope.
 */

/** Bonus emitted to WS/BS rolls against a Surprised target. */
export const SURPRISED_TO_HIT_BONUS = 30;

/** Round at which the Surprised condition automatically expires. */
export const SURPRISED_EXPIRES_AT_ROUND = 2;

export interface SurpriseModifierInput {
    /** True if the target carries the Surprised condition. */
    targetIsSurprised: boolean;
    /** Current combat round (1-indexed). 1 = the surprise round. */
    currentRound: number;
}

/**
 * Compute the to-hit bonus an attacker emits against a Surprised
 * target. The bonus applies only during the surprise round (round 1);
 * round 2 onward, the condition has expired.
 */
export function getSurpriseToHitBonus(input: SurpriseModifierInput): number {
    if (!input.targetIsSurprised) return 0;
    const round = Number.isFinite(input.currentRound) ? Math.trunc(input.currentRound) : 1;
    if (round >= SURPRISED_EXPIRES_AT_ROUND) return 0;
    return SURPRISED_TO_HIT_BONUS;
}

/**
 * Whether the actor can take a turn this round. Surprised actors lose
 * round 1; from round 2 onward they act normally even if the condition
 * is still flagged (it should have been cleared by the tracker hook).
 */
export function canActThisRound(targetIsSurprised: boolean, currentRound: number): boolean {
    if (!targetIsSurprised) return true;
    const round = Number.isFinite(currentRound) ? Math.trunc(currentRound) : 1;
    return round >= SURPRISED_EXPIRES_AT_ROUND;
}

/**
 * Whether the actor can use Reactions. Surprised actors cannot react
 * during the surprise round.
 */
export function canUseReactions(targetIsSurprised: boolean, currentRound: number): boolean {
    return canActThisRound(targetIsSurprised, currentRound);
}
