/**
 * Declaring a move in combat (#805).
 *
 * Every line's Move action: a Half Action moves up to the Half Move (AB metres), a
 * Full Action up to the Full Move. Run is its own Full Action, up to the Run Move,
 * declared when the character moves (until its next turn, ranged attacks against it
 * take −20 and melee attacks +20). Disengage is a Full Action that allows a Half Move
 * out of melee.
 *
 * Operator (2026-11-24): the first move of a turn asks which action it is. A move
 * within the Half Move is a Half Action; one longer than that goes straight to a Full
 * Action. Run is offered then, since it must be declared up front. After a Half Move,
 * moving again offers the other Half Action for a second Half Move.
 *
 * Pure: what the move asks for, given what has been declared and moved this turn.
 */

/** The combatant flag holding the move declared this turn. */
export const DECLARED_MOVE_FLAG = 'moveDeclared';

/** What the character has declared this turn. */
export type DeclaredMove = 'none' | 'half' | 'twoHalves' | 'full' | 'run' | 'disengage';

/** A move action the first-move prompt can offer. */
export type MoveChoice = 'half' | 'full' | 'run';

/** The character's movement rates, in metres. */
export interface MoveRates {
    readonly half: number;
    readonly full: number;
    readonly run: number;
}

/** What a requested move needs. */
export type MovePrompt =
    | { readonly kind: 'allow' }
    | { readonly kind: 'declare'; readonly choices: readonly MoveChoice[] }
    | { readonly kind: 'secondHalf' }
    | { readonly kind: 'refuse'; readonly remaining: number };

/** How far a declaration lets the character move this turn. */
export function allowanceFor(declared: DeclaredMove, rates: MoveRates): number {
    const allowance: Record<DeclaredMove, number> = {
        none: 0,
        half: rates.half,
        disengage: rates.half,
        twoHalves: rates.half * 2,
        full: rates.full,
        run: rates.run,
    };
    return allowance[declared];
}

const EPSILON = 0.01;

/** What a move of `requested` metres needs, after `moved` metres this turn under `declared`. */
export function movePrompt(declared: DeclaredMove, moved: number, requested: number, rates: MoveRates): MovePrompt {
    const total = moved + requested;
    if (declared === 'none') {
        const choices: MoveChoice[] = [];
        // A move within the Half Move is a Half Action; past it, straight to a Full Action.
        if (total <= rates.half + EPSILON) choices.push('half');
        else if (total <= rates.full + EPSILON) choices.push('full');
        if (total <= rates.run + EPSILON) choices.push('run');
        return choices.length > 0 ? { kind: 'declare', choices } : { kind: 'refuse', remaining: rates.run };
    }
    const allowance = allowanceFor(declared, rates);
    if (total <= allowance + EPSILON) return { kind: 'allow' };
    // After one Half Move, the other Half Action buys a second.
    if (declared === 'half' && total <= rates.half * 2 + EPSILON) return { kind: 'secondHalf' };
    return { kind: 'refuse', remaining: Math.max(0, allowance - moved) };
}

/** The action a choice spends. */
export function actionCostOf(choice: MoveChoice | 'secondHalf'): 'half' | 'full' {
    return choice === 'half' || choice === 'secondHalf' ? 'half' : 'full';
}
