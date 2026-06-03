/**
 * Combat movement enforcement (#235) — pure rule logic.
 *
 * During an active encounter, only the combatant whose turn it is may move, and
 * only up to their movement allowance for the turn; spending a Charge/Run action
 * raises that allowance. This evaluates a single attempted token move against
 * those constraints. It is intentionally CONSERVATIVE: anything it can't decide
 * confidently (no active combat, mover isn't in the tracker, allowance unknown)
 * resolves to `allowed: true`, so enforcement never wrongly blocks movement.
 *
 * Foundry-free so it is unit-testable; the preUpdateToken hook feeds it the
 * measured move distance, the per-turn total so far, and the actor's allowance.
 */

export interface MovementEvaluation {
    allowed: boolean;
    reason: 'ok' | 'not-your-turn' | 'over-budget';
    /** Metres still available this turn after the move (clamped at 0); for messaging. */
    remaining: number;
}

export interface MovementEvaluationInput {
    /** Whether enforcement applies at all (active combat + automation === 'full'). */
    enforced: boolean;
    /** True when it is this mover's combat turn. */
    isActorsTurn: boolean;
    /** Metres already moved this turn (before this move). */
    movedThisTurnMetres: number;
    /** Metres this move would add. */
    requestedMetres: number;
    /** Total metres allowed this turn (full move, raised by Charge/Run). 0/negative = unknown → don't enforce budget. */
    allowanceMetres: number;
}

/**
 * Decide whether an attempted move is permitted under combat movement rules.
 * Allows freely when not enforced; blocks off-turn movement; blocks moves whose
 * running total would exceed the turn's allowance (when the allowance is known).
 */
export function evaluateCombatMovement(input: MovementEvaluationInput): MovementEvaluation {
    const { enforced, isActorsTurn, movedThisTurnMetres, requestedMetres, allowanceMetres } = input;

    if (!enforced) return { allowed: true, reason: 'ok', remaining: Number.POSITIVE_INFINITY };

    if (!isActorsTurn) return { allowed: false, reason: 'not-your-turn', remaining: 0 };

    // Unknown allowance (≤ 0) → can't enforce a budget; allow the move.
    if (!(allowanceMetres > 0)) return { allowed: true, reason: 'ok', remaining: Number.POSITIVE_INFINITY };

    const used = Math.max(0, movedThisTurnMetres);
    const requested = Math.max(0, requestedMetres);
    const remaining = Math.max(0, allowanceMetres - used);

    // Small tolerance for grid/float rounding so a legal full move isn't blocked.
    const EPSILON = 0.01;
    if (used + requested > allowanceMetres + EPSILON) {
        return { allowed: false, reason: 'over-budget', remaining };
    }
    return { allowed: true, reason: 'ok', remaining: Math.max(0, remaining - requested) };
}

/**
 * The metres a combatant may move this turn: a full move, raised to charge/run
 * when that movement action has been spent this turn. Returns the largest
 * applicable rate (0 when none are known → caller treats as "unknown").
 */
export function turnMovementAllowance(
    rates: { full?: number; charge?: number; run?: number } | undefined,
    spent: { charge?: boolean; run?: boolean } | undefined,
): number {
    if (rates === undefined) return 0;
    if (spent?.run === true && typeof rates.run === 'number') return rates.run;
    if (spent?.charge === true && typeof rates.charge === 'number') return rates.charge;
    return typeof rates.full === 'number' ? rates.full : 0;
}
