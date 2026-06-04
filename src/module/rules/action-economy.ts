/**
 * Per-turn action-economy tracking (#264). Stores each combatant's spent
 * actions on a combatant flag, resets it when the turn/round advances (mirroring
 * the movement-enforcement turn-budget pattern, #235), and exposes a spend API
 * the combat HUD calls. The pure budget model lives in {@link ./action-budget.ts}.
 *
 * Conservative: every read/write is guarded and resolves to a fresh budget on
 * error, so a flag quirk can never wedge combat.
 */

import { SYSTEM_ID } from '../constants.ts';
import {
    type ActionsSpent,
    type ActionKind,
    actionBudgetView,
    type ActionBudgetView,
    coerceActionsSpent,
    EMPTY_ACTIONS_SPENT,
    spendAction,
} from './action-budget.ts';

const ACTIONS_SPENT_FLAG = 'actionsSpentThisTurn';

/* eslint-disable no-restricted-syntax -- boundary: Foundry Combat / Combatant are loosely typed framework surfaces; reads are structural and guarded, all wrapped in resolve-on-error */
// Kept minimal (no getFlag/setFlag) so Foundry's Combat/Combatant are structurally
// assignable to it; the flag accessor is reached via the cast below (its getFlag
// scope type is too narrow to put on the contravariant hook handler param).
type LooseCombatant = { id?: string | null; actorId?: string | null };
type LooseCombat = {
    started?: boolean;
    combatant?: LooseCombatant | null | undefined;
    combatants?: Iterable<LooseCombatant> | null | undefined;
};
type FlagAccessor = {
    getFlag?: (scope: string, key: string) => unknown;
    setFlag?: (scope: string, key: string, value: ActionsSpent) => Promise<unknown>;
};

/** Read a combatant's spent-actions budget (fresh when unset / unreadable). */
export function readActionsSpent(combatant: LooseCombatant | null | undefined): ActionsSpent {
    return coerceActionsSpent((combatant as FlagAccessor | null | undefined)?.getFlag?.(SYSTEM_ID, ACTIONS_SPENT_FLAG));
}

/** Persist a combatant's spent-actions budget (no-op when setFlag is unavailable). */
function writeActionsSpent(combatant: LooseCombatant | null | undefined, spent: ActionsSpent): void {
    const setFlag = (combatant as FlagAccessor | null | undefined)?.setFlag;
    if (typeof setFlag === 'function') void setFlag(SYSTEM_ID, ACTIONS_SPENT_FLAG, spent);
}

/** Locate the combatant for an actor id in the active combat. */
function findCombatant(actorId: string): LooseCombatant | null {
    const combat = (globalThis as { game?: { combat?: LooseCombat | null } }).game?.combat;
    const combatants = combat?.combatants;
    if (!combatants) return null;
    for (const c of combatants) {
        if (c.actorId === actorId) return c;
    }
    return null;
}

/** The current action-budget readout for an actor's combatant, or null if not in combat. */
export function actionBudgetForActor(actorId: string): ActionBudgetView | null {
    try {
        const combatant = findCombatant(actorId);
        return combatant ? actionBudgetView(readActionsSpent(combatant)) : null;
    } catch (err) {
        console.error('WH40K | action economy (view) — ignoring', err);
        return null;
    }
}

/** Spend one action of `kind` for the given actor's combatant. Returns the new view (or null). */
export function spendActionForActor(actorId: string, kind: ActionKind): ActionBudgetView | null {
    try {
        const combatant = findCombatant(actorId);
        if (!combatant) return null;
        const next = spendAction(readActionsSpent(combatant), kind);
        writeActionsSpent(combatant, next);
        return actionBudgetView(next);
    } catch (err) {
        console.error('WH40K | action economy (spend) — ignoring', err);
        return null;
    }
}

/** Reset an actor's combatant action budget to a fresh turn (HUD reset button). */
export function resetActionsForActor(actorId: string): void {
    try {
        const combatant = findCombatant(actorId);
        if (combatant) writeActionsSpent(combatant, { ...EMPTY_ACTIONS_SPENT });
    } catch (err) {
        console.error('WH40K | action economy (reset) — ignoring', err);
    }
}

/** Reset the now-active combatant's budget when the turn/round advances. */
function onUpdateCombat(combat: LooseCombat, changes: { turn?: number | null | undefined; round?: number | null | undefined }): void {
    try {
        if (!('turn' in changes) && !('round' in changes)) return;
        writeActionsSpent(combat.combatant, { ...EMPTY_ACTIONS_SPENT });
    } catch (err) {
        console.error('WH40K | action economy (turn reset) — ignoring', err);
    }
}
/* eslint-enable no-restricted-syntax */

/** Register the per-turn action-economy reset hook. */
export function registerActionEconomy(): void {
    Hooks.on('updateCombat', onUpdateCombat);
}
