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

/** The combat move modes a player selects (the move-mode toggle / token flag).
 *
 * Disengage is NOT a move mode / speed — in DH2 it is a Half Action (#416): a
 * Half Move that provokes no reaction, spent through the action economy, so it
 * lives with the combat actions, not in this movement-rate list. */
export type MovementMode = 'half' | 'full' | 'charge' | 'run';

/** Movement rates derived on the actor (metres). */
export interface MovementRates {
    half?: number;
    full?: number;
    charge?: number;
    run?: number;
}

/**
 * The metres a combatant may move this turn for the **selected move mode** — the
 * in-combat move-mode toggle (persisted as the token's `movementAction` flag).
 * Half is the half-action move; Full/Charge/Run are full-action moves — Charge/Run
 * raise the allowance to their larger rate. Falls back to the full move when the
 * mode is unset or its rate is unknown; 0 when no rate is known (caller treats 0
 * as "unknown" → budget not enforced).
 */
export function turnMovementAllowance(rates: MovementRates | undefined, mode: MovementMode | undefined): number {
    if (rates === undefined) return 0;
    if (mode !== undefined && typeof rates[mode] === 'number') return rates[mode];
    return typeof rates.full === 'number' ? rates.full : 0;
}

/** Combat-tab move-mode cluster view (#235): what the move-mode toggles render. */
export interface CombatMovementView {
    /** True during an active encounter — show the per-turn budget line + states. */
    inCombat: boolean;
    /** True when the cluster should grey out / turn-gate (in combat, not this actor's turn, not GM). */
    disabled: boolean;
    /** The currently-selected move mode (highlighted toggle), if any. */
    selectedMode: MovementMode | undefined;
    /** Metres still available this turn for the selected mode (clamped at 0). */
    remaining: number;
}

/**
 * Compute the move-mode cluster view from combat state. Pure: the sheet gathers the
 * Foundry state (combat started, whose turn, GM, the token's selected mode, metres
 * moved) and this derives the render flags. GMs are never disabled — they move freely.
 */
export function combatMovementView(input: {
    inCombat: boolean;
    isActorsTurn: boolean;
    isGM: boolean;
    selectedMode: MovementMode | undefined;
    rates: MovementRates | undefined;
    movedThisTurnMetres: number;
}): CombatMovementView {
    const disabled = input.inCombat && !input.isActorsTurn && !input.isGM;
    const allowance = turnMovementAllowance(input.rates, input.selectedMode);
    const remaining = allowance > 0 ? Math.max(0, allowance - Math.max(0, input.movedThisTurnMetres)) : 0;
    return { inCombat: input.inCombat, disabled, selectedMode: input.selectedMode, remaining };
}
