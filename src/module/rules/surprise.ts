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
 * **The +30 is NOT here.** It is already live by a better route: a target
 * carrying the `surprised` condition is mapped to `isUnaware` by
 * `rules/target-situationals.ts`, which auto-selects the `unawareTarget`
 * circumstance modifier (`rules/combat-circumstance-modifiers.ts`, +30). A second
 * implementation of the same bonus previously sat in this module with no caller,
 * free to drift from the live one — it was deleted rather than wired (#514).
 *
 * What remains here is the part that route does NOT cover: the condition's
 * lifetime, and the turn/reaction loss.
 */

/** Round at which the Surprised condition automatically expires. */
export const SURPRISED_EXPIRES_AT_ROUND = 2;

/** Foundry status id for the Surprised condition, as the content packs author it. */
export const SURPRISED_STATUS_ID = 'surprised';

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

/**
 * Whether the Surprised condition should be cleared now that this round has begun.
 *
 * RAW gives the condition a one-round life: it applies during the surprise round
 * and is gone from round 2. Nothing enforced that, so a GM who applied Surprised
 * left the target permanently easier to hit — the +30 circumstance modifier keeps
 * auto-selecting for as long as the condition sits on the token. Expiring it is
 * what bounds that bonus to the round RAW gives it.
 * @param {number} round  The round that has just started (1-indexed).
 * @returns {boolean}  Whether Surprised has outlived its round.
 */
export function surpriseHasExpired(round: number): boolean {
    const current = Number.isFinite(round) ? Math.trunc(round) : 1;
    return current >= SURPRISED_EXPIRES_AT_ROUND;
}
