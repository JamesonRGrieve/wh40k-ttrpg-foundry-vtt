/**
 * Only War Comrade-in-Combat action handlers (#152 — core.md p.12137).
 *
 * Three sheet-action methods wired into the character-sheet action map:
 *
 *   - `owComradeWound`   — manually mark the Comrade wounded (track
 *                          advance via {@link applyComradeHit}). No-op
 *                          when the Comrade is already dead.
 *   - `owComradeHeal`    — restore wounded → unharmed via
 *                          {@link healComrade}. No-op when the Comrade
 *                          is unharmed or dead.
 *   - `owComradeReplace` — replace a dead Comrade via
 *                          {@link replaceComrade}. The "replacement
 *                          available" gate is the actor's `refitAvailable`
 *                          (back in camp for refitting); the panel disables
 *                          the button on the same gate.
 *
 * Each method emits an OW Comrade chat card so the table can see the
 * track change without inspecting the sheet.
 *
 * Handlers are exported as `this`-typed free functions; the Foundry
 * V14 ApplicationV2 action map binds `this` to the sheet instance at
 * click-time, so the character sheet wires them like:
 *
 *     import * as OwComradeActions from '../../actions/ow-comrade-actions.ts';
 *     static DEFAULT_OPTIONS = {
 *         actions: {
 *             owComradeWound:   OwComradeActions.owComradeWound,
 *             owComradeHeal:    OwComradeActions.owComradeHeal,
 *             owComradeReplace: OwComradeActions.owComradeReplace,
 *         },
 *     };
 */

import { comradeRulesFor } from '../config/game-systems/index.ts';
import { SYSTEM_ID } from '../constants.ts';
import { currentCombatRound } from '../rolls/counter-attack-flow.ts';
import { emitChatFromTemplate } from '../rolls/roll-helpers.ts';
import { type ComradeStateChange, comradeStateChange } from '../rules/ow-comrade-healing.ts';
import {
    applyComradeHit,
    applyComradeMentalDamage,
    comradeFearEndsWithCombat,
    type ComradeHitStrike,
    type ComradeRecord,
    type ComradeState,
    COMRADE_STATE_LABEL_KEYS,
    healComrade,
    readComradeRecord,
    recoverComrade,
    replaceComrade,
} from '../rules/ow-comrade.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

/**
 * Structural type the OW Comrade handlers expect: the character sheet's
 * `actor`, narrowed to the OW Comrade fields.
 */
interface OwComradeHost {
    actor: Actor.Implementation & {
        name: string;
        system: {
            comrade: ComradeRecord;
            /** Back in camp for refitting: a dead Comrade can be replaced (#152). */
            refitAvailable: boolean;
            /** Days of recovery the Comrade still owes (#157). */
            comradeRecoveryDays: number;
        };
    };
}

type Host = OwComradeHost;

/** The PC whose Comrade an event concerns, as the save and the card read it. */
interface ComradeOwner {
    /** The PC's name. */
    name: string;
    /** Save a state change on the PC. */
    save: (change: ComradeStateChange) => Promise<void>;
    /** Who the card speaks as: the PC. */
    speaker: ReturnType<typeof ChatMessage.getSpeaker>;
    comradeName: string;
    /** Days of recovery the Comrade still owes (#157). */
    recoveryDays: number;
}

/** The owner a sheet action acts for. */
function ownerOf(host: Host): ComradeOwner {
    return {
        name: host.actor.name,
        save: async (change) => {
            await host.actor.update({ ...change });
        },
        speaker: ChatMessage.getSpeaker({ actor: host.actor }),
        comradeName: host.actor.system.comrade.name,
        recoveryDays: host.actor.system.comradeRecoveryDays,
    };
}

/** Days of recovery the Comrade still owes (#157), off an actor's system data; 0 when the slot is absent. */
function recoveryDaysOf(system: object): number {
    return 'comradeRecoveryDays' in system && typeof system.comradeRecoveryDays === 'number' ? system.comradeRecoveryDays : 0;
}

/** Save a state change with the recovery clock it implies (#157), in one update. */
async function saveState(owner: ComradeOwner, previous: ComradeState, next: ComradeState): Promise<void> {
    await owner.save(comradeStateChange(previous, next, owner.recoveryDays));
}

/** Result payload threaded into the chat card after a state-change action. */
interface StateChangePayload {
    previousState: ComradeState;
    newState: ComradeState;
    transitioned: boolean;
    replaced: boolean;
}

/** A move on the Comrade's state track, as the card states it. */
interface StateChangeEvent {
    reason: 'none' | 'doubles';
    previousState: ComradeState;
    newState: ComradeState;
    previousStateKey: string;
    newStateKey: string;
    transitioned: boolean;
    replaced: boolean;
}

/** The event an OW Comrade chat card states (`ow-comrade-chat.hbs`). */
type ComradeChatEvent =
    | { kind: 'recover'; wasFleeing: boolean; wasPinned: boolean }
    | { kind: 'mental'; mentalKind: string; mentalKey: string; amount: number; total: number; threshold: number; dies: boolean }
    | ({ kind: 'state-change' | 'hit-transfer' } & StateChangeEvent);

/** Post the OW Comrade chat card for an event, spoken by the PC. */
async function emitComradeEvent(owner: ComradeOwner, event: ComradeChatEvent): Promise<void> {
    const templateData = {
        gameSystem: 'ow',
        // Only War is the one line with Comrades; per-system theming reads it (#422).
        _gameSystemId: 'ow',
        actor: { name: owner.name },
        comradeName: owner.comradeName || '—',
        event,
    };
    await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/ow-comrade-chat.hbs', templateData, { speaker: owner.speaker, applyWhispers: true });
}

async function emitStateChangeChat(owner: ComradeOwner, payload: StateChangePayload): Promise<void> {
    await emitComradeEvent(owner, {
        kind: 'state-change',
        reason: 'none',
        previousState: payload.previousState,
        newState: payload.newState,
        previousStateKey: COMRADE_STATE_LABEL_KEYS[payload.previousState],
        newStateKey: COMRADE_STATE_LABEL_KEYS[payload.newState],
        transitioned: payload.transitioned,
        replaced: payload.replaced,
    });
}

/* -------------------------------------------- */
/*  owComradeWound — manual track advance       */
/* -------------------------------------------- */

/**
 * Manually mark the Comrade wounded (or kill an already-wounded one).
 *
 * Wired to `data-action="owComradeWound"` on the panel's Wound button.
 * The button is `disabled` while the Comrade is dead, so the no-op
 * branch is defence-in-depth.
 */
export async function owComradeWound(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const owner = ownerOf(this);
    const previousState = this.actor.system.comrade.state;
    const result = applyComradeHit(previousState);
    if (result.transitioned) {
        await saveState(owner, previousState, result.newState);
    }
    await emitStateChangeChat(owner, {
        previousState,
        newState: result.newState,
        transitioned: result.transitioned,
        replaced: false,
    });
}

/* -------------------------------------------- */
/*  owComradeHeal — wounded → unharmed          */
/* -------------------------------------------- */

/**
 * Heal a wounded Comrade back to unharmed.
 *
 * Wired to `data-action="owComradeHeal"`. The button is `disabled`
 * unless the Comrade is wounded, so the no-op branch is
 * defence-in-depth.
 */
export async function owComradeHeal(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const owner = ownerOf(this);
    const previousState = this.actor.system.comrade.state;
    const result = healComrade(previousState);
    if (result.transitioned) {
        await saveState(owner, previousState, result.newState);
    }
    await emitStateChangeChat(owner, {
        previousState,
        newState: result.newState,
        transitioned: result.transitioned,
        replaced: false,
    });
}

/* -------------------------------------------- */
/*  owComradeRecover — a recovery Order          */
/* -------------------------------------------- */

/**
 * The Comrade receives an Order that lets it recover from Fear and Pinning (OW
 * Core p. 271: it stays affected "until they receive an order that allows them to
 * recover"; the Sergeant's is one, p. 82). Clears both, and states it on a card.
 *
 * Wired to `data-action="owComradeRecover"`; the panel enables it only while the
 * Comrade is fleeing or pinned.
 */
export async function owComradeRecover(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const { fleeing, pinned } = this.actor.system.comrade;
    if (!fleeing && !pinned) return;
    const owner = ownerOf(this);
    await this.actor.update(recoverComrade());
    await emitComradeEvent(owner, { kind: 'recover', wasFleeing: fleeing, wasPinned: pinned });
}

/* -------------------------------------------- */
/*  owComradeMental — Insanity / Corruption      */
/* -------------------------------------------- */

/** The panel's amount input next to the Insanity / Corruption buttons. */
function mentalAmount(target: HTMLElement): number {
    const input = target.closest('[data-wh40k-hook="ow-comrade-panel"]')?.querySelector<HTMLInputElement>('input[data-comrade-mental-amount]');
    return Number(input?.value ?? 0);
}

/**
 * The Comrade suffers Insanity or Corruption (OW Core p. 271): it does not track
 * them, but dies when it "would suffer 10 Insanity or 10 Corruption in a single
 * Round". The amount comes from the panel's input, the kind from the button
 * (`data-mental-kind`). The Round's tally is saved, and a Comrade that reaches the
 * threshold dies.
 */
export async function owComradeMental(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const kind = target.dataset['mentalKind'];
    const rules = comradeRulesFor(firstSystemId(this.actor));
    const { comrade } = this.actor.system;
    if ((kind !== 'insanity' && kind !== 'corruption') || rules === null || comrade.state === 'dead') return;
    const owner = ownerOf(this);
    const amount = mentalAmount(target);
    const result = applyComradeMentalDamage({ tally: comrade.mental, now: currentCombatRound(game.combat), kind, amount, rules });
    await this.actor.update({
        'system.comrade.mental': result.tally,
        ...(result.dies ? comradeStateChange(comrade.state, 'dead', owner.recoveryDays) : {}),
    });
    await emitComradeEvent(owner, {
        kind: 'mental',
        mentalKind: kind,
        mentalKey: kind === 'insanity' ? 'WH40K.OW.Comrade.Mental.Insanity' : 'WH40K.OW.Comrade.Mental.Corruption',
        amount: Math.max(0, Math.trunc(Number.isFinite(amount) ? amount : 0)),
        total: result.total,
        threshold: rules.mentalDeathThreshold,
        dies: result.dies,
    });
}

/* -------------------------------------------- */
/*  A hit that strikes the Comrade instead       */
/* -------------------------------------------- */

/** The chat-message flag a damage card carries a Comrade hit on (#152). */
export const COMRADE_HIT_FLAG = 'comradeHit';

// eslint-disable-next-line no-restricted-syntax -- boundary: a chat-message flag is an untyped JSON bag; narrowed by this guard
function readComradeHitFlag(value: unknown): ComradeHitStrike | null {
    if (typeof value !== 'object' || value === null || !('actorUuid' in value) || typeof value.actorUuid !== 'string' || value.actorUuid === '') return null;
    const comradeName = 'comradeName' in value && typeof value.comradeName === 'string' ? value.comradeName : '';
    return { actorUuid: value.actorUuid, comradeName };
}

/**
 * A hit struck a PC's Comrade instead (OW Core p. 271): one step on its state track
 * (unharmed → wounded → dead), saved with the recovery clock it implies (#157), and
 * stated on a card. The damage card's poster may not own the PC, so the active GM
 * applies it when the card is created.
 */
export function applyComradeHitFromMessage(message: ChatMessage): void {
    if (game.users.activeGM?.isSelf !== true) return;
    const strike = readComradeHitFlag(message.getFlag(SYSTEM_ID, COMRADE_HIT_FLAG));
    if (strike !== null) void applyComradeHitTo(strike);
}

async function applyComradeHitTo(strike: ComradeHitStrike): Promise<void> {
    const actor = await fromUuid(strike.actorUuid);
    if (!(actor instanceof Actor)) return;
    const comrade = readComradeRecord(actor.system);
    if (comrade === null) return;
    const owner: ComradeOwner = {
        name: actor.name,
        save: async (change) => {
            await actor.update({ ...change });
        },
        speaker: ChatMessage.getSpeaker({ alias: actor.name }),
        comradeName: comrade.name,
        recoveryDays: recoveryDaysOf(actor.system),
    };
    const result = applyComradeHit(comrade.state);
    if (result.transitioned) await saveState(owner, comrade.state, result.newState);
    await emitComradeEvent(owner, {
        kind: 'hit-transfer',
        reason: 'doubles',
        previousState: comrade.state,
        newState: result.newState,
        previousStateKey: COMRADE_STATE_LABEL_KEYS[comrade.state],
        newStateKey: COMRADE_STATE_LABEL_KEYS[result.newState],
        transitioned: result.transitioned,
        replaced: false,
    });
}

/* -------------------------------------------- */
/*  End of combat                               */
/* -------------------------------------------- */

/**
 * A combat ended: a Comrade that fled stops fleeing (OW Core p. 271: "They remain
 * affected until the end of combat, or until they receive an order"). Pinning does
 * not end with the combat. Run by the active GM only, so it happens once.
 */
export async function clearComradeFearAtCombatEnd(actors: Iterable<Actor.Implementation | null>): Promise<void> {
    if (game.users.activeGM?.isSelf !== true) return;
    const fled = Array.from(actors).filter((actor): actor is Actor.Implementation => {
        const comrade = actor === null ? null : readComradeRecord(actor.system);
        return comrade !== null && comradeFearEndsWithCombat(comrade);
    });
    await Promise.all(
        fled.map(async (actor) => {
            await actor.update({ 'system.comrade.fleeing': false });
        }),
    );
}

/* -------------------------------------------- */
/*  owComradeReplace — dead → unharmed (camp)   */
/* -------------------------------------------- */

/**
 * Replace a dead Comrade with a fresh one. RAW (OW Core p.110 / p.271): only
 * legal while the existing Comrade is dead AND the squad is back in camp for
 * refitting — the actor's `refitAvailable` flag, which the panel gates on too.
 * The replacement uses up that refit and clears the recovery clock (#157).
 *
 * Wired to `data-action="owComradeReplace"`. The button is `disabled`
 * unless dead + in camp, so the negative branches here are
 * defence-in-depth.
 */
export async function owComradeReplace(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const previousState = this.actor.system.comrade.state;
    // In camp for refitting is the actor's `refitAvailable` (#152), the same flag the panel gates on.
    const owner = ownerOf(this);
    const result = replaceComrade(previousState, this.actor.system.refitAvailable);
    if (result.transitioned) {
        await saveState(owner, previousState, result.newState);
    }
    await emitStateChangeChat(owner, {
        previousState,
        newState: result.newState,
        transitioned: result.transitioned,
        replaced: result.replaced,
    });
}
