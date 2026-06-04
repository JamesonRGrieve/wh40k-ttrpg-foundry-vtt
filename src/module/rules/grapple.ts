/**
 * Grapple state machine (#120 — core.md L10155-10180).
 *
 * Grappling is a multi-step engagement initiated by a successful WS test on
 * a Charge or Standard Attack and then resolved round-by-round through
 * opposed Strength tests. Each combatant in a grapple is in one of three
 * states — `none` (not in a grapple), `grappling` (the controller of the
 * grapple), and `controlled` (the grappled victim). The controller may
 * spend their round on a Damage / Throw Down / etc. action; the controlled
 * side may attempt a Break Free / Stand Up / Move.
 *
 * Every action below resolves through an opposed Strength test: the actor
 * rolls 1d100 against `actorStrength` and the opponent rolls 1d100 against
 * `opponentStrength`. The acting side wins the contest by either landing a
 * pass when the opponent fails OR by accumulating more degrees of success
 * than the opponent when both pass. Ties go to the controller per RAW.
 *
 * The helpers here are pure: they take pre-rolled `1d100` values + the
 * relevant Strength totals and return a `GrappleResolution` describing the
 * outcome. The UI layer (character sheet → grapple controller panel) is
 * responsible for prompting the rolls and emitting chat cards.
 */

import { degreesOfSuccess, resolveOpposed } from './_dice.ts';

/** Re-exported from the shared dice primitives for callers/tests importing it from this module. */
export { degreesOfSuccess };

/** Three legal states for a combatant with respect to a grapple. */
export type GrappleState = 'none' | 'grappling' | 'controlled';

/** Enumerated controller / controlled actions, all opposed-Strength resolved. */
type GrappleAction = 'damage-opponent' | 'throw-down-opponent' | 'break-free' | 'stand-up' | 'move-while-grappling';

/** Input shape for every opposed-Strength resolver below. */
export interface OpposedStrengthInput {
    /** Acting combatant's d100 roll (1-100). */
    actorRoll: number;
    /** Acting combatant's Strength characteristic total. */
    actorStrength: number;
    /** Opponent's d100 roll (1-100). */
    opponentRoll: number;
    /** Opponent's Strength characteristic total. */
    opponentStrength: number;
}

/** Resolution payload returned by every grapple action helper. */
export interface GrappleResolution {
    /** True when the acting combatant wins the opposed test. */
    success: boolean;
    /** Degrees of success for the actor (0 when actor failed their roll). */
    actorDoS: number;
    /** Degrees of success for the opponent (0 when opponent failed their roll). */
    opponentDoS: number;
    /** Net DoS (actorDoS − opponentDoS) for downstream effects like damage scaling. */
    netDoS: number;
    /** The action that was resolved (echoed for chat-card / log convenience). */
    action: GrappleAction;
}

/**
 * Generic opposed Strength resolver. The acting side wins when it scores at
 * least as many degrees of success as the opponent — `tie: 'a'` routes the
 * equal-DoS contest (and the both-fail 0–0 contest) to the actor, modelling
 * the controller-favoring tie at every call site (the resolver always returns
 * `success` for the side passed in as `actor`). See {@link resolveOpposed} for
 * the shared core; the grapple-specific net-DoS scaling is read off the result.
 */
function resolveOpposedStrength(input: OpposedStrengthInput, action: GrappleAction): GrappleResolution {
    const {
        success,
        aDoS: actorDoS,
        bDoS: opponentDoS,
        netDoS,
    } = resolveOpposed({ roll: input.actorRoll, target: input.actorStrength }, { roll: input.opponentRoll, target: input.opponentStrength }, { tie: 'a' });
    return { success, actorDoS, opponentDoS, netDoS, action };
}

/**
 * Controller's "Damage" action — opposed Strength test; on win, the
 * controller inflicts SB Impact damage on the controlled side. The
 * resolver returns the contest outcome; the damage roll is computed by
 * the UI layer from `netDoS` and the controller's Strength Bonus.
 */
export function resolveDamageOpponent(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'damage-opponent');
}

/**
 * Controller's "Throw Down" action — opposed Strength test; on win, the
 * controlled side is thrown to the ground (Prone condition) and the
 * grapple state on both combatants resets to `none`.
 */
export function resolveThrowDownOpponent(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'throw-down-opponent');
}

/**
 * Controlled side's "Break Free" action — opposed Strength test; on win,
 * the grapple ends and both combatants transition to `none`. On failure
 * the grapple persists into the next round.
 */
export function resolveBreakGrapple(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'break-free');
}

/**
 * Controlled side's "Stand Up" action — opposed Strength test taken when
 * the controlled side has been knocked prone but is still gripped.
 * Standing inside an active grapple is contested by the controller's
 * Strength; success rises to a standing grapple, failure leaves the
 * controlled side prone.
 */
export function resolveStandUpInGrapple(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'stand-up');
}

/**
 * Controlled side's "Move" action — opposed Strength test to drag the
 * grapple a short distance. On success the pair shifts up to the
 * controlled side's Agility Bonus in metres in the chosen direction; the
 * controller is dragged along.
 */
export function resolveMoveWhileGrappling(input: OpposedStrengthInput): GrappleResolution {
    return resolveOpposedStrength(input, 'move-while-grappling');
}
