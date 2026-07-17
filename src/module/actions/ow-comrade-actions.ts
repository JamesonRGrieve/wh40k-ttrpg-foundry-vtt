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
 *                          available" gate is read from a sheet-level
 *                          camp toggle exposed on `target.dataset['inCamp']`
 *                          (the panel templates this as the disabled
 *                          attribute); the action itself defends against
 *                          the misuse path.
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

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { postChatCard } from '../rolls/roll-helpers.ts';
import { type ComradeState, applyComradeHit, healComrade, replaceComrade } from '../rules/ow-comrade.ts';
import { firstSystemId } from '../utils/chat-system-id.ts';

const STATE_LABEL_KEY: Record<ComradeState, string> = {
    unharmed: 'WH40K.OW.Comrade.State.Unharmed',
    wounded: 'WH40K.OW.Comrade.State.Wounded',
    dead: 'WH40K.OW.Comrade.State.Dead',
};

/**
 * Structural type the OW Comrade handlers expect. The character sheet
 * already exposes `actor` + `_updateSystemField`; the additional
 * narrowing here is the OW-specific `system.comrade` sub-document.
 */
interface OwComradeHost {
    actor: WH40KBaseActor & {
        name: string;
        system: {
            comrade: {
                name: string;
                state: ComradeState;
                distanceM: number;
                hasVisualLine: boolean;
            };
        };
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: forwards arbitrary system-field values to Foundry's Document.update() via the sheet helper
    _updateSystemField: (field: string, value: unknown) => Promise<void>;
}

type Host = OwComradeHost;

/** Result payload threaded into the chat card after a state-change action. */
interface StateChangePayload {
    previousState: ComradeState;
    newState: ComradeState;
    transitioned: boolean;
    replaced: boolean;
}

async function emitStateChangeChat(host: Host, payload: StateChangePayload): Promise<void> {
    const templateData = {
        gameSystem: 'ow',
        _gameSystemId: firstSystemId(host.actor),
        actor: { name: host.actor.name },
        comradeName: host.actor.system.comrade.name || '—',
        event: {
            kind: 'state-change',
            reason: 'none',
            previousState: payload.previousState,
            newState: payload.newState,
            previousStateKey: STATE_LABEL_KEY[payload.previousState],
            newStateKey: STATE_LABEL_KEY[payload.newState],
            transitioned: payload.transitioned,
            replaced: payload.replaced,
        },
    };
    const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ow-comrade-chat.hbs', templateData);
    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor is assignment-compatible but getSpeaker expects the concrete Foundry Actor type
    const speaker = ChatMessage.getSpeaker({ actor: host.actor as unknown as WH40KBaseActor });
    await postChatCard(html, { speaker });
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
    const previousState = this.actor.system.comrade.state;
    const result = applyComradeHit(previousState);
    if (result.transitioned) {
        await this._updateSystemField('system.comrade.state', result.newState);
    }
    await emitStateChangeChat(this, {
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
    const previousState = this.actor.system.comrade.state;
    const result = healComrade(previousState);
    if (result.transitioned) {
        await this._updateSystemField('system.comrade.state', result.newState);
    }
    await emitStateChangeChat(this, {
        previousState,
        newState: result.newState,
        transitioned: result.transitioned,
        replaced: false,
    });
}

/* -------------------------------------------- */
/*  owComradeReplace — dead → unharmed (camp)   */
/* -------------------------------------------- */

/**
 * Replace a dead Comrade with a fresh one. RAW: only legal while the
 * existing Comrade is dead AND a replacement is available (camp /
 * downtime / Regiment Resource spend). The panel surfaces
 * `data-in-camp="true"` on the button when the scene allows it.
 *
 * Wired to `data-action="owComradeReplace"`. The button is `disabled`
 * unless dead + in camp, so the negative branches here are
 * defence-in-depth.
 */
export async function owComradeReplace(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const previousState = this.actor.system.comrade.state;
    const replacementAvailable = target.dataset['inCamp'] === 'true' || target.dataset['replacementAvailable'] === 'true';
    const result = replaceComrade(previousState, replacementAvailable);
    if (result.transitioned) {
        await this._updateSystemField('system.comrade.state', result.newState);
    }
    await emitStateChangeChat(this, {
        previousState,
        newState: result.newState,
        transitioned: result.transitioned,
        replaced: result.replaced,
    });
}
