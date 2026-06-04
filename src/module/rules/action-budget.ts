/**
 * Per-turn action economy (#264). Pure, Foundry-free model of the DH2 action
 * budget so it is unit-testable; the combat glue (combatant flag, turn reset,
 * HUD wiring) lives in {@link ./action-economy.ts}.
 *
 * DH2 economy (core.md "Actions", p. 218): in a turn a combatant may take one
 * **Full** action OR two **Half** actions, plus any number of **Free** actions
 * (GM-gated, uncapped here) and one **Reaction** (Dodge/Parry, used on other
 * combatants' turns). We model the Full/Half pool as 2 action points — a Full
 * costs both, a Half costs one.
 */

export type ActionKind = 'full' | 'half' | 'free' | 'reaction';

/** Count of each action kind spent so far this turn. */
export interface ActionsSpent {
    full: number;
    half: number;
    free: number;
    reaction: number;
}

/** A fresh, nothing-spent budget. */
export const EMPTY_ACTIONS_SPENT: ActionsSpent = { full: 0, half: 0, free: 0, reaction: 0 };

/** Action points available per turn (1 Full = 2 points, 1 Half = 1 point). */
const ACTION_POINTS_PER_TURN = 2;
/** Reactions available before the combatant's next turn. */
const REACTIONS_PER_ROUND = 1;

/** Clamp a persisted-flag field to a non-negative integer count. */
function clampCount(raw: number | string | boolean | null | undefined): number {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Coerce a persisted combatant-flag value into a valid {@link ActionsSpent}. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the combatant flag is an untyped persisted Foundry blob; coerced field-by-field below
export function coerceActionsSpent(value: unknown): ActionsSpent {
    if (value === null || typeof value !== 'object') return { ...EMPTY_ACTIONS_SPENT };
    // eslint-disable-next-line no-restricted-syntax -- boundary: persisted flag object; each field is re-validated by clampCount
    const v = value as Record<string, number | string | boolean | null | undefined>;
    return { full: clampCount(v['full']), half: clampCount(v['half']), free: clampCount(v['free']), reaction: clampCount(v['reaction']) };
}

/** Full/Half points consumed so far. */
export function usedActionPoints(spent: ActionsSpent): number {
    return spent.full * ACTION_POINTS_PER_TURN + spent.half;
}

/** Whether the combatant may still spend an action of the given kind. */
export function canSpendAction(spent: ActionsSpent, kind: ActionKind): boolean {
    if (kind === 'full') return usedActionPoints(spent) === 0;
    if (kind === 'half') return usedActionPoints(spent) <= ACTION_POINTS_PER_TURN - 1;
    if (kind === 'reaction') return spent.reaction < REACTIONS_PER_ROUND;
    return true; // free — GM-gated; no hard cap
}

/** Spend one action of the given kind (pure; clamps — a disallowed spend is a no-op). */
export function spendAction(spent: ActionsSpent, kind: ActionKind): ActionsSpent {
    if (!canSpendAction(spent, kind)) return spent;
    return { ...spent, [kind]: spent[kind] + 1 };
}

/** Refund (undo) one spent action of the given kind, never below zero. */
export function refundAction(spent: ActionsSpent, kind: ActionKind): ActionsSpent {
    if (spent[kind] <= 0) return spent;
    return { ...spent, [kind]: spent[kind] - 1 };
}

/** Readout for the combat HUD. */
export interface ActionBudgetView {
    fullAvailable: boolean;
    halfRemaining: number;
    reactionRemaining: number;
    freeSpent: number;
    usedPoints: number;
}

/** Project the spent state into a display readout. */
export function actionBudgetView(spent: ActionsSpent): ActionBudgetView {
    const usedPoints = usedActionPoints(spent);
    return {
        fullAvailable: usedPoints === 0,
        halfRemaining: Math.max(0, ACTION_POINTS_PER_TURN - usedPoints),
        reactionRemaining: Math.max(0, REACTIONS_PER_ROUND - spent.reaction),
        freeSpent: spent.free,
        usedPoints,
    };
}
