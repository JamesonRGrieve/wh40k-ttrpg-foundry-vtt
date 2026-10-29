/**
 * Only War Comrade-Healing action handlers (#157 — OW core,
 * "Healing Comrades" and replacement on return to camp).
 *
 * Four sheet-action methods wired into the character-sheet action map:
 *
 *   - `owComradeTickDay`     — advance the recovery clock by one day of
 *                               in-fiction rest; the last day returns
 *                               the Comrade to unharmed.
 *   - `owComradeMedicae`     — prompt for the wound's single
 *                               Difficult(-10) Medicae Test's Degrees of
 *                               Success and apply it to the clock.
 *   - `owComradeReplace2`    — return-to-camp replacement of a dead
 *                               Comrade, gated on `system.refitAvailable`.
 *   - `owComradeToggleRefit` — mark the squad back in camp for refitting.
 *
 * Every state change goes through the rules layer's
 * {@link comradeStateChange}, the same update #152's Wound / Heal /
 * Replace make. The tick, Medicae and replace actions emit an OW Comrade
 * Healing chat card, so the table sees the resolution without inspecting
 * the sheet.
 *
 * Handlers are exported as `this`-typed free functions; the Foundry
 * V14 ApplicationV2 action map binds `this` to the sheet instance at
 * click-time, so the character sheet wires them like:
 *
 *     import * as OwComradeHealingActions from '../../actions/ow-comrade-healing-actions.ts';
 *     static DEFAULT_OPTIONS = {
 *         actions: {
 *             owComradeTickDay:  OwComradeHealingActions.owComradeTickDay,
 *             owComradeMedicae:  OwComradeHealingActions.owComradeMedicae,
 *             owComradeReplace2: OwComradeHealingActions.owComradeReplace2,
 *         },
 *     };
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { emitChatFromTemplate } from '../rolls/roll-helpers.ts';
import { applyMedicaeAttempt, comradeStateChange, processReplacement, type ReplacementSkipReason, tickComradeRecovery } from '../rules/ow-comrade-healing.ts';
import type { ComradeState } from '../rules/ow-comrade.ts';

/**
 * Structural type the OW Comrade-Healing handlers expect. The
 * character sheet already exposes `actor` + `_updateSystemField`;
 * this narrows to the OW-specific `comradeRecoveryDays` slot, the
 * `refitAvailable` gate, and the `system.comrade.state` track owned
 * by the #152 mixin.
 */
interface OwComradeHealingHost {
    actor: WH40KBaseActor & {
        name: string;
        system: {
            comradeRecoveryDays: number;
            refitAvailable: boolean;
            comradeMedicaeUsed: boolean;
            comrade: {
                name: string;
                state: ComradeState;
            };
        };
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: forwards arbitrary system-field values to Foundry's Document.update() via the sheet helper
    _updateSystemField: (field: string, value: unknown) => Promise<void>;
}

type Host = OwComradeHealingHost;

interface TickChatPayload {
    kind: 'tick';
    daysElapsed: number;
    remainingDays: number;
    recovered: boolean;
}

interface MedicaeChatPayload {
    kind: 'medicae';
    degreesOfSuccess: number;
    reducedBy: number;
    remainingDays: number;
    recovered: boolean;
}

interface ReplaceChatPayload {
    kind: 'replace';
    replaced: boolean;
    reason?: ReplacementSkipReason;
}

type ChatPayload = TickChatPayload | MedicaeChatPayload | ReplaceChatPayload;

async function emitHealingChat(host: Host, event: ChatPayload): Promise<void> {
    const templateData = {
        gameSystem: 'ow',
        actor: { name: host.actor.name },
        comradeName: host.actor.system.comrade.name || '—',
        event,
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor is assignment-compatible but getSpeaker expects the concrete Foundry Actor type
    const speaker = ChatMessage.getSpeaker({ actor: host.actor as unknown as WH40KBaseActor });
    // `_gameSystemId` is derived by the helper from the speaker's actor (#422).
    await emitChatFromTemplate('systems/wh40k-rpg/templates/chat/ow-comrade-healing-chat.hbs', templateData, { speaker, applyWhispers: true });
}

/* -------------------------------------------- */
/*  owComradeTickDay — advance the recovery clock */
/* -------------------------------------------- */

/**
 * Write the recovery clock after a tick or a Medicae test. The day the clock
 * reaches 0 the wounded Comrade is back on their feet (OW core), so the
 * state moves to unharmed in the same update.
 */
async function saveRecoveryClock(host: Host, remainingDays: number, extra: { 'system.comradeMedicaeUsed'?: boolean } = {}): Promise<void> {
    const { state } = host.actor.system.comrade;
    const change = remainingDays === 0 && state === 'wounded' ? comradeStateChange(state, 'unharmed', 0) : { 'system.comradeRecoveryDays': remainingDays };
    await host.actor.update({ ...change, ...extra });
}

/**
 * Tick the Comrade's recovery clock down by one in-fiction day of
 * rest. The day that brings it to 0 returns the Comrade to unharmed.
 *
 * Wired to `data-action="owComradeTickDay"`. The button is `disabled`
 * unless a wounded Comrade still owes days, so the no-op branch is
 * defence-in-depth.
 */
export async function owComradeTickDay(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const result = tickComradeRecovery({
        remainingDays: this.actor.system.comradeRecoveryDays,
        daysElapsed: 1,
    });
    await saveRecoveryClock(this, result.remainingDays);
    await emitHealingChat(this, {
        kind: 'tick',
        daysElapsed: 1,
        remainingDays: result.remainingDays,
        recovered: result.recovered,
    });
}

/* -------------------------------------------- */
/*  owComradeMedicae — Difficult(-10) Medicae shortcut */
/* -------------------------------------------- */

interface DegreesOfSuccessPromptResult {
    degreesOfSuccess: number;
}

async function promptDegreesOfSuccess(): Promise<number | null> {
    const dialogApi = (foundry.applications.api as { DialogV2?: typeof foundry.applications.api.DialogV2 }).DialogV2;
    if (!dialogApi?.prompt) {
        // Best-effort fallback for the licensed-Foundry-not-available
        // path: assume the operator accepts 0 DoS (no reduction). The
        // rules module clamps this to a no-op, so the action stays
        // safe.
        return 0;
    }
    const title = game.i18n.localize('WH40K.OW.ComradeHealing.Medicae.Title');
    const difficultyLabel = game.i18n.localize('WH40K.OW.ComradeHealing.Medicae.Difficulty');
    const content = `
        <fieldset>
            <legend>${difficultyLabel}</legend>
            <div class="form-group">
                <label for="ow-medicae-dos">${title}</label>
                <input type="number" name="degreesOfSuccess" id="ow-medicae-dos" value="0" min="0" step="1" />
            </div>
        </fieldset>
    `;
    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt returns unknown; narrow via shape guards below
    const raw = (await dialogApi.prompt({
        window: { title },
        content,
        ok: {
            callback: (_evt: Event, button: HTMLButtonElement) => {
                const form = button.form;
                const input = form?.elements.namedItem('degreesOfSuccess');
                if (input instanceof HTMLInputElement) {
                    const parsed = Number.parseInt(input.value, 10);
                    return { degreesOfSuccess: Number.isFinite(parsed) && parsed >= 0 ? parsed : 0 };
                }
                return { degreesOfSuccess: 0 };
            },
        },
        rejectClose: false,
    })) as DegreesOfSuccessPromptResult | null | undefined;
    if (raw == null) return null;
    return Number.isFinite(raw.degreesOfSuccess) ? raw.degreesOfSuccess : 0;
}

/**
 * Apply one Difficult(-10) Medicae Test result to the Comrade's
 * recovery clock.
 *
 * Wired to `data-action="owComradeMedicae"`. RAW allows a single test per
 * wound (OW core): the attempt is recorded as `comradeMedicaeUsed`, and
 * the panel disables the button once it is spent or when no wound is healing.
 * A test that clears the clock returns the Comrade to unharmed.
 */
export async function owComradeMedicae(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    if (this.actor.system.comradeMedicaeUsed) return;
    const dos = await promptDegreesOfSuccess();
    if (dos == null) return; // operator cancelled
    const result = applyMedicaeAttempt({
        remainingDays: this.actor.system.comradeRecoveryDays,
        degreesOfSuccess: dos,
    });
    await saveRecoveryClock(this, result.remainingDays, { 'system.comradeMedicaeUsed': true });
    await emitHealingChat(this, {
        kind: 'medicae',
        degreesOfSuccess: dos,
        reducedBy: result.reducedBy,
        remainingDays: result.remainingDays,
        recovered: result.remainingDays === 0,
    });
}

/* -------------------------------------------- */
/*  owComradeReplace2 — return-to-camp replacement */
/* -------------------------------------------- */

/**
 * Replace a dead Comrade with a fresh one on return to camp.
 *
 * Wired to `data-action="owComradeReplace2"`. The button is `disabled`
 * unless `system.comrade.state === 'dead'` AND `system.refitAvailable`
 * is true.
 *
 * It applies the same {@link comradeStateChange} as #152's
 * `owComradeReplace`: the recovery clock clears and the camp refit is
 * used up. It emits the healing-namespace chat card, so the resolution is
 * reported like the rest of the healing engine.
 */
export async function owComradeReplace2(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const { state } = this.actor.system.comrade;
    const result = processReplacement({ stateAtCamp: state, refitAvailable: this.actor.system.refitAvailable });
    if (result.replaced) {
        await this.actor.update({ ...comradeStateChange(state, result.newState, 0) });
    }
    await emitHealingChat(this, {
        kind: 'replace',
        replaced: result.replaced,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
    });
}

/* -------------------------------------------- */
/*  owComradeToggleRefit — back in camp          */
/* -------------------------------------------- */

/**
 * Mark the squad as back in camp for refitting, or as having left it. While it
 * is, a dead Comrade can be replaced (OW core). Wired to
 * `data-action="owComradeToggleRefit"` on the healing panel's refit row.
 */
export async function owComradeToggleRefit(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    await this._updateSystemField('system.refitAvailable', !this.actor.system.refitAvailable);
}
