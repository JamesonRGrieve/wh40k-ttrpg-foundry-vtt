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

import type { ActionLimit } from './condition-mechanics.ts';

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

/**
 * Full/Half action points a limit leaves the combatant per turn.
 *  - `noActions` / `loseTurn`: none (the bearer cannot act on its turn);
 *  - `halfActionOnly`: a single Half action (Pinned);
 *  - `grappleOnly` / `none`: the normal pool — `grappleOnly` restricts WHICH
 *    actions may be taken, not how many, and the budget does not model action
 *    identity, so it is surfaced on the view rather than enforced here.
 */
function actionPointsUnder(limit: ActionLimit): number {
    if (limit === 'noActions' || limit === 'loseTurn') return 0;
    if (limit === 'halfActionOnly') return 1;
    return ACTION_POINTS_PER_TURN;
}

/** Reactions a limit leaves the combatant. Only `noActions` (Stunned) removes them. */
function reactionsUnder(limit: ActionLimit): number {
    return limit === 'noActions' ? 0 : REACTIONS_PER_ROUND;
}

/**
 * Whether the combatant may still spend an action of the given kind, under the
 * action limit its active conditions impose (`rules/condition-mechanics.ts`).
 * @param {ActionsSpent} spent  Actions spent so far this turn.
 * @param {ActionKind} kind  The action to spend.
 * @param {ActionLimit} [limit]  The governing condition action limit.
 * @returns {boolean}  Whether the spend is allowed.
 */
export function canSpendAction(spent: ActionsSpent, kind: ActionKind, limit: ActionLimit = 'none'): boolean {
    const points = actionPointsUnder(limit);
    if (kind === 'full') return points >= ACTION_POINTS_PER_TURN && usedActionPoints(spent) === 0;
    if (kind === 'half') return usedActionPoints(spent) <= points - 1;
    if (kind === 'reaction') return spent.reaction < reactionsUnder(limit);
    // free — GM-gated, no hard cap; but a bearer who cannot act at all takes none.
    return points > 0;
}

/** Spend one action of the given kind (pure; clamps — a disallowed spend is a no-op). */
export function spendAction(spent: ActionsSpent, kind: ActionKind, limit: ActionLimit = 'none'): ActionsSpent {
    if (!canSpendAction(spent, kind, limit)) return spent;
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
    /** The condition action limit the readout was computed under. */
    actionLimit: ActionLimit;
}

/** Project the spent state into a display readout, under the bearer's action limit. */
export function actionBudgetView(spent: ActionsSpent, limit: ActionLimit = 'none'): ActionBudgetView {
    const usedPoints = usedActionPoints(spent);
    return {
        fullAvailable: canSpendAction(spent, 'full', limit),
        halfRemaining: Math.max(0, actionPointsUnder(limit) - usedPoints),
        reactionRemaining: Math.max(0, reactionsUnder(limit) - spent.reaction),
        freeSpent: spent.free,
        usedPoints,
        actionLimit: limit,
    };
}
