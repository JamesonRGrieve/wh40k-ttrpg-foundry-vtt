/**
 * Per-turn action-economy tracking (#264). Stores each combatant's spent
 * actions on a combatant flag and resets it at the combatant's turn-start
 * boundary — subscribed through the shared turn-hook wrapper (#413), the single
 * place downstream features derive the turn boundary. Exposes the spend / view /
 * reset API the combat HUD, combat tab, and tracker sidebar call. The pure
 * budget model lives in {@link ./action-budget.ts}.
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
import { onTurnStart, type TurnCombatant } from './combat-turn-hooks.ts';
import { type ActionLimit, resolveActionLimit } from './condition-mechanics.ts';
import { activeConditionMechanics, type ConditionBearer } from './condition-registry.ts';

const ACTIONS_SPENT_FLAG = 'actionsSpentThisTurn';
/** Set when the combatant takes Disengage; cleared at its next turn (#770). */
const DISENGAGED_FLAG = 'disengagedThisTurn';

// Kept minimal (no getFlag/setFlag) so Foundry's Combat/Combatant are structurally
// assignable to it; the flag accessor is reached via the cast below (its getFlag
// scope type is too narrow to put on the contravariant hook handler param).
type LooseCombatant = { id?: string | null; actorId?: string | null; tokenId?: string | null; actor?: ConditionBearer | null | undefined };
type LooseCombat = {
    started?: boolean;
    combatant?: LooseCombatant | null | undefined;
    combatants?: Iterable<LooseCombatant> | null | undefined;
};
type FlagAccessor = {
    /** The persisted budget this module writes: partial, or absent on a fresh combatant (coerceActionsSpent re-validates it). */
    getFlag?: (scope: string, key: string) => Partial<ActionsSpent> | null | undefined;
    setFlag?: (scope: string, key: string, value: ActionsSpent) => Promise<object>;
};

/** Read a combatant's spent-actions budget (fresh when unset / unreadable). */
export function readActionsSpent(combatant: LooseCombatant | null | undefined): ActionsSpent {
    return coerceActionsSpent((combatant as FlagAccessor | null | undefined)?.getFlag?.(SYSTEM_ID, ACTIONS_SPENT_FLAG));
}

/** Persist a combatant's spent-actions budget (no-op when setFlag is unavailable). */
function writeActionsSpent(combatant: LooseCombatant | null | undefined, spent: ActionsSpent): void {
    // Call ON the combatant so `this` binds — a detached `setFlag(...)` runs with
    // this=undefined and throws inside Foundry ("reading 'constructor' of undefined").
    const target = combatant as FlagAccessor | null | undefined;
    if (typeof target?.setFlag === 'function') void target.setFlag(SYSTEM_ID, ACTIONS_SPENT_FLAG, spent);
}

/**
 * Locate the combatant for an actor: in the combat this client views, else in any
 * started combat. With `tokenId` (an unlinked token's actor) it matches that token's
 * combatant, since copies of one creature share an actor id (#777); without one (a
 * linked actor) it matches by actor id.
 */
function findCombatant(actorId: string, tokenId: string | null = null): LooseCombatant | null {
    // `game.combat` is the combat on the scene THIS client views. A player looking at
    // another scene (their own map, a journal handout) has none there, yet their actor
    // still fights in the GM's started combat — and its Reaction must be read and spent
    // on that combatant, not silently skipped (#414). Prefer the viewed combat, then
    // any other started one that holds the actor.
    const g = (globalThis as { game?: { combat?: LooseCombat | null; combats?: Iterable<LooseCombat> | null } }).game;
    const viewed = g?.combat ?? null;
    const started = [...(g?.combats ?? [])].filter((combat) => combat !== viewed && combat.started === true);
    for (const combat of viewed === null ? started : [viewed, ...started]) {
        for (const c of combat.combatants ?? []) {
            if (tokenId !== null ? c.tokenId === tokenId : c.actorId === actorId) return c;
        }
    }
    return null;
}

/**
 * The action limit the combatant's active conditions impose — the most
 * restrictive `system.actionLimit` among them (Stunned, Pinned, Grappled, …),
 * read from the condition documents rather than matched by name.
 */
function combatantActionLimit(combatant: LooseCombatant): ActionLimit {
    return resolveActionLimit(activeConditionMechanics(combatant.actor)).limit;
}

/** The current action-budget readout for an actor's combatant (by token when given), or null if not in combat. */
export function actionBudgetForActor(actorId: string, tokenId: string | null = null): ActionBudgetView | null {
    try {
        const combatant = findCombatant(actorId, tokenId);
        return combatant ? actionBudgetView(readActionsSpent(combatant), combatantActionLimit(combatant)) : null;
    } catch (err) {
        console.error('WH40K | action economy (view) — ignoring', err);
        return null;
    }
}

/** Spend one action of `kind` for the given actor's combatant (by token when given). Returns the new view (or null). */
export function spendActionForActor(actorId: string, kind: ActionKind, tokenId: string | null = null): ActionBudgetView | null {
    try {
        const combatant = findCombatant(actorId, tokenId);
        if (!combatant) return null;
        const limit = combatantActionLimit(combatant);
        const next = spendAction(readActionsSpent(combatant), kind, limit);
        writeActionsSpent(combatant, next);
        return actionBudgetView(next, limit);
    } catch (err) {
        console.error('WH40K | action economy (spend) — ignoring', err);
        return null;
    }
}

/** Reset an actor's combatant action budget (by token when given) to a fresh turn (HUD reset button). */
export function resetActionsForActor(actorId: string, tokenId: string | null = null): void {
    try {
        const combatant = findCombatant(actorId, tokenId);
        if (combatant) writeActionsSpent(combatant, { ...EMPTY_ACTIONS_SPENT });
    } catch (err) {
        console.error('WH40K | action economy (reset) — ignoring', err);
    }
}

/** Disengage's flag accessor on a combatant. */
type DisengageFlagAccessor = {
    getFlag?: (scope: string, key: string) => boolean | null | undefined;
    setFlag?: (scope: string, key: string, value: boolean) => Promise<object>;
};

/** Record that an actor's combatant (by token when given) took Disengage this turn (#770). */
export function markDisengaged(actorId: string, tokenId: string | null = null): void {
    try {
        const target = findCombatant(actorId, tokenId) as DisengageFlagAccessor | null;
        if (typeof target?.setFlag === 'function') void target.setFlag(SYSTEM_ID, DISENGAGED_FLAG, true);
    } catch (err) {
        console.error('WH40K | action economy (disengage) — ignoring', err);
    }
}

/** Whether an actor's combatant (by token when given) took Disengage this turn (#770). */
export function disengagedThisTurn(actorId: string, tokenId: string | null = null): boolean {
    try {
        const target = findCombatant(actorId, tokenId) as DisengageFlagAccessor | null;
        return target?.getFlag?.(SYSTEM_ID, DISENGAGED_FLAG) === true;
    } catch {
        return false;
    }
}

/** Reset the starting combatant's budget (Full/Half/Free + Reaction) and Disengage for a fresh turn. */
function resetOnTurnStart(combatant: TurnCombatant | null): void {
    try {
        if (combatant === null) return;
        writeActionsSpent(combatant, { ...EMPTY_ACTIONS_SPENT });
        const target = combatant as DisengageFlagAccessor;
        if (target.getFlag?.(SYSTEM_ID, DISENGAGED_FLAG) === true && typeof target.setFlag === 'function') void target.setFlag(SYSTEM_ID, DISENGAGED_FLAG, false);
    } catch (err) {
        console.error('WH40K | action economy (turn reset) — ignoring', err);
    }
}

/** Register the per-turn action-economy reset via the shared turn-start hook (#413). */
export function registerActionEconomy(): void {
    onTurnStart(resetOnTurnStart);
}
