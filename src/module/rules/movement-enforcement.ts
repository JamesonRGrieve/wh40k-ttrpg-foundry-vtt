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
import { spendActionForActor } from './action-economy.ts';
import { onTurnStart, type TurnCombatant } from './combat-turn-hooks.ts';
import { actionCostOf, allowanceFor, DECLARED_MOVE_FLAG, type DeclaredMove, type MoveChoice, movePrompt, type MoveRates } from './move-declaration.ts';
import { evaluateCombatMovement, MOVE_MODE_FLAG, type MovementEvaluation } from './movement-budget.ts';

const MOVED_FLAG = 'movedThisTurnMetres';
/** Set when the combatant Runs; cleared at the start of its next turn (#805). */
export const RAN_FLAG = 'ranSinceLastTurn';
/** The update option that marks a move whose action has been declared, so the hook lets it through. */
const DECLARED_MOVE = 'wh40kMoveDeclared';

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
    actor?: { id?: string | null; system?: { movement?: { half?: number; full?: number; charge?: number; run?: number } } } | null;
    update?: (data: object, options?: object) => Promise<unknown>;
    setFlag?: (scope: string, key: string, value: string) => Promise<unknown>;
};
// Kept minimal so Foundry's Combat/Combatant are structurally assignable to it
// (its getFlag/setFlag carry a narrow scope type that a `string` param rejects).
type LooseCombatant = { tokenId?: string | null };
type LooseCombat = { started?: boolean; combatant?: LooseCombatant | null | undefined };
// Flag accessor read off the combatant via cast — getFlag/setFlag are typed too
// narrowly on Combatant to put in the contravariant handler param above.
type FlagAccessor = {
    getFlag?: (scope: string, key: string) => number | string | boolean | null | undefined;
    setFlag?: (scope: string, key: string, value: number | string | boolean) => Promise<void>;
};

/** The per-turn moved-metres flag on a combatant (0 when unset / unreadable). */
function readMovedMetres(combatant: LooseCombatant | null | undefined): number {
    const value = Number((combatant as FlagAccessor | null | undefined)?.getFlag?.(SYSTEM_ID, MOVED_FLAG) ?? 0);
    return Number.isFinite(value) ? value : 0;
}

/** Persist the per-turn moved-metres flag (no-op when setFlag is unavailable). */
function writeMovedMetres(combatant: LooseCombatant | TurnCombatant | null | undefined, metres: number): void {
    // Call ON the combatant so `this` binds — a detached `setFlag(...)` runs with
    // this=undefined and throws inside Foundry ("reading 'constructor' of undefined").
    const target = combatant as FlagAccessor | null | undefined;
    if (typeof target?.setFlag === 'function') void target.setFlag(SYSTEM_ID, MOVED_FLAG, metres);
}

/** The move the combatant declared this turn; 'none' when unset. */
function readDeclared(combatant: LooseCombatant | null | undefined): DeclaredMove {
    const raw = (combatant as FlagAccessor | null | undefined)?.getFlag?.(SYSTEM_ID, DECLARED_MOVE_FLAG);
    return raw === 'half' || raw === 'twoHalves' || raw === 'full' || raw === 'run' || raw === 'disengage' ? raw : 'none';
}

/** Record the combatant's declared move for this turn. */
export async function writeDeclared(combatant: LooseCombatant | TurnCombatant | null | undefined, declared: DeclaredMove): Promise<void> {
    const target = combatant as FlagAccessor | null | undefined;
    if (typeof target?.setFlag === 'function') await target.setFlag(SYSTEM_ID, DECLARED_MOVE_FLAG, declared);
}

/** The token's actor's movement rates, in metres. */
function moveRates(token: LooseToken): MoveRates {
    const movement = token.actor?.system?.movement;
    return { half: movement?.half ?? 0, full: movement?.full ?? 0, run: movement?.run ?? 0 };
}

/** Ask which move action this is (#805); null when the player cancels. A GM may also move freely. */
async function askMoveAction(prompt: { kind: 'declare'; choices: readonly MoveChoice[] } | { kind: 'secondHalf' }, rates: MoveRates, requested: number): Promise<MoveChoice | 'secondHalf' | 'free' | null> {
    const distances: Record<MoveChoice | 'secondHalf', number> = { half: rates.half, full: rates.full, run: rates.run, secondHalf: rates.half * 2 };
    const options = prompt.kind === 'declare' ? [...prompt.choices] : (['secondHalf'] as const);
    const buttons = options.map((choice, index) => ({
        action: choice,
        label: t(`WH40K.Combat.MoveDeclare.Choice.${choice}`, { metres: String(distances[choice]) }),
        default: index === 0,
    }));
    if (game.user.isGM) buttons.push({ action: 'free', label: t('WH40K.Combat.MoveDeclare.Free'), default: false });
    const content = `<p>${t(prompt.kind === 'declare' ? 'WH40K.Combat.MoveDeclare.Body' : 'WH40K.Combat.MoveDeclare.SecondHalfBody', { metres: String(Math.round(requested * 10) / 10), half: String(rates.half) })}</p><p>${t('WH40K.Combat.MoveDeclare.RunNote')}</p>`;
    const result = await foundry.applications.api.DialogV2.wait({
        window: { title: t('WH40K.Combat.MoveDeclare.Title') },
        content,
        buttons,
        rejectClose: false,
    });
    return typeof result === 'string' && (result === 'free' || result === 'secondHalf' || result === 'half' || result === 'full' || result === 'run') ? result : null;
}

/** Ask, spend the action, record the declaration, then repeat the held move. */
async function declareAndMove(
    tokenDoc: LooseToken,
    combatant: LooseCombatant | null | undefined,
    prompt: { kind: 'declare'; choices: readonly MoveChoice[] } | { kind: 'secondHalf' },
    rates: MoveRates,
    requested: number,
    changes: { x?: number | null | undefined; y?: number | null | undefined },
): Promise<void> {
    const choice = await askMoveAction(prompt, rates, requested);
    if (choice === null) return;
    if (choice !== 'free') {
        const actorId = tokenDoc.actor?.id ?? null;
        if (actorId !== null) spendActionForActor(actorId, actionCostOf(choice), tokenDoc.id ?? null);
        await writeDeclared(combatant, choice === 'secondHalf' ? 'twoHalves' : choice);
        if (choice !== 'secondHalf') await tokenDoc.setFlag?.(SYSTEM_ID, MOVE_MODE_FLAG, choice);
        // Run: until its next turn, ranged attacks against it take −20 and melee +20.
        if (choice === 'run') await (combatant as FlagAccessor | null | undefined)?.setFlag?.(SYSTEM_ID, RAN_FLAG, true);
    }
    await tokenDoc.update?.({ x: changes.x ?? tokenDoc.x, y: changes.y ?? tokenDoc.y }, { [DECLARED_MOVE]: true });
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

/**
 * preUpdateToken: block an off-turn or over-budget move, and hold a move that needs
 * its action declared (#805) while the player picks it; return true to allow.
 */
function onPreUpdateToken(
    tokenDoc: LooseToken,
    changes: { x?: number | null | undefined; y?: number | null | undefined },
    options: Record<string, unknown> = {},
): boolean {
    try {
        if (!('x' in changes) && !('y' in changes)) return true;
        if (options[DECLARED_MOVE] === true) return true;
        if (WH40KSettings.getMovementAutomation() !== 'full') return true;
        const combat = game.combat as LooseCombat | null;
        if (combat?.started !== true) return true;
        const isActorsTurn = combat.combatant?.tokenId === tokenDoc.id;
        // GMs move freely (narrative / corrections), except the active combatant on its turn.
        if (game.user.isGM && !isActorsTurn) return true;

        const combatant = combat.combatant;
        const declared = isActorsTurn ? readDeclared(combatant) : 'none';
        const moved = readMovedMetres(combatant);
        const requested = measureMoveMetres(tokenDoc, changes);
        const rates = moveRates(tokenDoc);
        const decision = decideTokenMove({
            automation: 'full',
            hasActiveCombat: true,
            isActorsTurn,
            movedThisTurnMetres: moved,
            requestedMetres: requested,
            allowanceMetres: allowanceFor(declared, rates),
        });
        if (decision.allowed) return true;
        if (decision.reason === 'not-your-turn') {
            ui.notifications.warn(t('WH40K.Combat.NotYourTurnMove'));
            return false;
        }
        const prompt = movePrompt(declared, moved, requested, rates);
        if (prompt.kind === 'allow') return true;
        if (prompt.kind === 'refuse') {
            ui.notifications.warn(t('WH40K.Combat.OverMovementBudget', { remaining: Math.round(prompt.remaining) }));
            return false;
        }
        void declareAndMove(tokenDoc, combatant, prompt, rates, requested, changes);
        return false;
    } catch (err) {
        console.error('WH40K | movement enforcement (preUpdateToken) — allowing on error', err);
        return true;
    }
}

/**
 * updateToken: accumulate the moved distance onto the active combatant for the
 * turn. Recorded under every automation level, not only `full`: it is also how a
 * vehicle is known to be moving when it is attacked (#678).
 */
function onUpdateToken(tokenDoc: LooseToken, changes: { x?: number | null | undefined; y?: number | null | undefined }): void {
    try {
        if (!('x' in changes) && !('y' in changes)) return;
        const combat = game.combat as LooseCombat | null;
        const combatant = combat?.combatant;
        if (combat?.started !== true || combatant?.tokenId !== tokenDoc.id) return;
        writeMovedMetres(combatant, readMovedMetres(combatant) + measureMoveMetres(tokenDoc, changes));
    } catch (err) {
        console.error('WH40K | movement enforcement (updateToken) — ignoring', err);
    }
}

/** Reset the starting combatant's moved distance, declared move and Run at the turn-start boundary. */
function resetMovementOnTurnStart(combatant: TurnCombatant | null): void {
    try {
        if (combatant === null) return;
        writeMovedMetres(combatant, 0);
        void writeDeclared(combatant, 'none');
        const target = combatant as FlagAccessor;
        if (target.getFlag?.(SYSTEM_ID, RAN_FLAG) === true) void target.setFlag?.(SYSTEM_ID, RAN_FLAG, false);
    } catch (err) {
        console.error('WH40K | movement enforcement (turn reset) — ignoring', err);
    }
}
/* eslint-enable no-restricted-syntax */

/** Register the combat movement-enforcement hooks. Idempotent enough for boot. */
export function registerMovementEnforcement(): void {
    Hooks.on('preUpdateToken', onPreUpdateToken);
    Hooks.on('updateToken', onUpdateToken);
    // Per-turn budget resets via the shared turn-start hook (#413), the single
    // place the combatant turn boundary is derived.
    onTurnStart(resetMovementOnTurnStart);
}
