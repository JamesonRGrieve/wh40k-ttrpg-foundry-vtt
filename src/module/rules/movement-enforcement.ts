/**
 * Combat movement enforcement hooks (#235).
 *
 * Turn-gates and rate-limits token movement during an active encounter when the
 * Movement Automation setting is `full`: only the active combatant may move, and
 * only up to the metres they have left this turn (a full move, raised by a spent
 * Charge/Run action). The decision is the pure {@link decideTokenMove}; the hooks
 * read Foundry state, measure the move, and block over-budget / off-turn moves.
 *
 * Deliberately conservative: GM moves are never blocked, and any error or missing
 * data resolves to "allow", so a measurement quirk can never freeze the canvas.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { WH40KSettings } from '../wh40k-rpg-settings.ts';
import { evaluateCombatMovement, type MovementEvaluation, type MovementMode, turnMovementAllowance } from './movement-budget.ts';

const MOVED_FLAG = 'movedThisTurnMetres';
/** Token flag the move-mode toggle (`setMovementMode`) writes — half/full/charge/run. */
const MOVEMENT_MODE_FLAG = 'movementAction';

export interface TokenMoveDecisionInput {
    automation: 'full' | 'display' | 'none';
    hasActiveCombat: boolean;
    isActorsTurn: boolean;
    movedThisTurnMetres: number;
    requestedMetres: number;
    allowanceMetres: number;
}

/** Pure decision: enforce only under `full` automation in an active combat. */
export function decideTokenMove(input: TokenMoveDecisionInput): MovementEvaluation {
    return evaluateCombatMovement({
        enforced: input.automation === 'full' && input.hasActiveCombat,
        isActorsTurn: input.isActorsTurn,
        movedThisTurnMetres: input.movedThisTurnMetres,
        requestedMetres: input.requestedMetres,
        allowanceMetres: input.allowanceMetres,
    });
}

/* eslint-disable no-restricted-syntax -- boundary: Foundry TokenDocument / Combat / Combatant / canvas.grid are loosely typed framework surfaces; reads are structural and guarded, all wrapped in allow-on-error */
type LooseToken = {
    id?: string | null;
    x?: number;
    y?: number;
    actor?: { system?: { movement?: { half?: number; full?: number; charge?: number; run?: number } } } | null;
};
// Kept minimal so Foundry's Combat/Combatant are structurally assignable to it
// (its getFlag/setFlag carry a narrow scope type that a `string` param rejects).
type LooseCombatant = { tokenId?: string | null };
type LooseCombat = { started?: boolean; combatant?: LooseCombatant | null | undefined };
// Flag accessor read off the combatant via cast — getFlag/setFlag are typed too
// narrowly on Combatant to put in the contravariant handler param above.
type FlagAccessor = {
    getFlag?: (scope: string, key: string) => number | string | null | undefined;
    setFlag?: (scope: string, key: string, value: number) => Promise<void>;
};

/** The per-turn moved-metres flag on a combatant (0 when unset / unreadable). */
function readMovedMetres(combatant: LooseCombatant | null | undefined): number {
    const value = Number((combatant as FlagAccessor | null | undefined)?.getFlag?.(SYSTEM_ID, MOVED_FLAG) ?? 0);
    return Number.isFinite(value) ? value : 0;
}

/** Persist the per-turn moved-metres flag (no-op when setFlag is unavailable). */
function writeMovedMetres(combatant: LooseCombatant | null | undefined, metres: number): void {
    const setFlag = (combatant as FlagAccessor | null | undefined)?.setFlag;
    if (typeof setFlag === 'function') void setFlag(SYSTEM_ID, MOVED_FLAG, metres);
}

/** The token's selected move mode (the move-mode toggle flag); undefined when unset/invalid → full move. */
function readMovementMode(token: LooseToken): MovementMode | undefined {
    const raw = (token as FlagAccessor | null | undefined)?.getFlag?.(SYSTEM_ID, MOVEMENT_MODE_FLAG);
    return raw === 'half' || raw === 'full' || raw === 'charge' || raw === 'run' ? raw : undefined;
}

/** Metres a token move covers, from the position delta and the scene grid. */
function measureMoveMetres(token: LooseToken, changes: { x?: number | null | undefined; y?: number | null | undefined }): number {
    const grid = (globalThis as { canvas?: { grid?: { size?: number; distance?: number } } }).canvas?.grid;
    const size = typeof grid?.size === 'number' && grid.size > 0 ? grid.size : 0;
    const distancePerCell = typeof grid?.distance === 'number' ? grid.distance : 0;
    if (size === 0 || distancePerCell === 0) return 0; // unknown grid → 0 → budget not enforced
    const oldX = token.x ?? 0;
    const oldY = token.y ?? 0;
    const newX = changes.x ?? oldX;
    const newY = changes.y ?? oldY;
    const cells = Math.hypot((newX - oldX) / size, (newY - oldY) / size);
    return cells * distancePerCell;
}

/** preUpdateToken: block an off-turn or over-budget move; return true to allow. */
function onPreUpdateToken(tokenDoc: LooseToken, changes: { x?: number | null | undefined; y?: number | null | undefined }): boolean {
    try {
        if (!('x' in changes) && !('y' in changes)) return true;
        if (game.user.isGM) return true; // GMs move freely (narrative / corrections)
        if (WH40KSettings.getMovementAutomation() !== 'full') return true;
        const combat = game.combat as LooseCombat | null;
        if (combat?.started !== true) return true;

        const decision = decideTokenMove({
            automation: 'full',
            hasActiveCombat: true,
            isActorsTurn: combat.combatant?.tokenId === tokenDoc.id,
            movedThisTurnMetres: readMovedMetres(combat.combatant),
            requestedMetres: measureMoveMetres(tokenDoc, changes),
            allowanceMetres: turnMovementAllowance(tokenDoc.actor?.system?.movement, readMovementMode(tokenDoc)),
        });

        if (!decision.allowed) {
            if (decision.reason === 'not-your-turn') ui.notifications.warn(t('WH40K.Combat.NotYourTurnMove'));
            else ui.notifications.warn(t('WH40K.Combat.OverMovementBudget', { remaining: Math.round(decision.remaining) }));
            return false;
        }
        return true;
    } catch (err) {
        console.error('WH40K | movement enforcement (preUpdateToken) — allowing on error', err);
        return true;
    }
}

/** updateToken: accumulate the moved distance onto the active combatant for the turn. */
function onUpdateToken(tokenDoc: LooseToken, changes: { x?: number | null | undefined; y?: number | null | undefined }): void {
    try {
        if (!('x' in changes) && !('y' in changes)) return;
        if (WH40KSettings.getMovementAutomation() !== 'full') return;
        const combat = game.combat as LooseCombat | null;
        const combatant = combat?.combatant;
        if (combat?.started !== true || combatant?.tokenId !== tokenDoc.id) return;
        writeMovedMetres(combatant, readMovedMetres(combatant) + measureMoveMetres(tokenDoc, changes));
    } catch (err) {
        console.error('WH40K | movement enforcement (updateToken) — ignoring', err);
    }
}

/** Reset the per-turn moved distance when the turn/round advances. */
function onUpdateCombat(combat: LooseCombat, changes: { turn?: number | null | undefined; round?: number | null | undefined }): void {
    try {
        if (!('turn' in changes) && !('round' in changes)) return;
        writeMovedMetres(combat.combatant, 0);
    } catch (err) {
        console.error('WH40K | movement enforcement (turn reset) — ignoring', err);
    }
}
/* eslint-enable no-restricted-syntax */

/** Register the combat movement-enforcement hooks. Idempotent enough for boot. */
export function registerMovementEnforcement(): void {
    Hooks.on('preUpdateToken', onPreUpdateToken);
    Hooks.on('updateToken', onUpdateToken);
    Hooks.on('updateCombat', onUpdateCombat);
}
