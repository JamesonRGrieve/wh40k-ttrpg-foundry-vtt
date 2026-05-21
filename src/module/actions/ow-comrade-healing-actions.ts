/**
 * Only War Comrade-Healing action handlers (#157 — core.md
 * §"Healing Comrades" p.12269; replacement p.12261).
 *
 * Three sheet-action methods wired into the character-sheet action map:
 *
 *   - `owComradeTickDay`  — advance the recovery clock by one day of
 *                            in-fiction rest. Defence-in-depth no-op
 *                            when `comradeRecoveryDays === 0`.
 *   - `owComradeMedicae`  — prompt the operator for the Difficult(-10)
 *                            Medicae Test's Degrees of Success and
 *                            apply it to the clock.
 *   - `owComradeReplace2` — return-to-camp replacement attempt. Reads
 *                            `refitAvailable` off the button dataset
 *                            (mirrored from `system.refitAvailable`)
 *                            and the current `comrade.state`. Distinct
 *                            from #152's `owComradeReplace`: this one
 *                            also flips `comradeRecoveryDays` back to
 *                            0 on success and routes through the
 *                            replacement chat card.
 *
 * Each method emits an OW Comrade Healing chat card so the table
 * sees the resolution without inspecting the sheet.
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
import {
    applyMedicaeAttempt,
    OW_COMRADE_AUTO_RECOVERY_DAYS,
    OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER,
    processReplacement,
    type ReplacementSkipReason,
    tickComradeRecovery,
} from '../rules/ow-comrade-healing.ts';
import type { ComradeState } from '../rules/ow-comrade.ts';

/**
 * Structural type the OW Comrade-Healing handlers expect. The
 * character sheet already exposes `actor` + `_updateSystemField`;
 * this narrows to the OW-specific `comradeRecoveryDays` slot, the
 * `refitAvailable` gate, and the `system.comrade.state` track owned
 * by the #152 mixin.
 */
export interface OwComradeHealingHost {
    actor: WH40KBaseActor & {
        name: string;
        system: {
            comradeRecoveryDays: number;
            refitAvailable: boolean;
            comrade: {
                name: string;
                state: ComradeState;
            };
        };
    };
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
    const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/ow-comrade-healing-chat.hbs', templateData);
    await ChatMessage.create({
        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40KBaseActor is assignment-compatible but getSpeaker expects the concrete Foundry Actor type
        speaker: ChatMessage.getSpeaker({ actor: host.actor as unknown as WH40KBaseActor }),
        content: html,
    });
}

/* -------------------------------------------- */
/*  owComradeTickDay — advance the recovery clock */
/* -------------------------------------------- */

/**
 * Tick the Comrade's recovery clock down by one in-fiction day of
 * rest.
 *
 * Wired to `data-action="owComradeTickDay"`. The button is `disabled`
 * unless `comradeRecoveryDays > 0`, so the no-op branch is
 * defence-in-depth.
 *
 * On the day that brings remainingDays to 0 the auto-recovery clock
 * is satisfied; the caller (or a separate "flip state on recovered"
 * action) is responsible for moving the Comrade's track back to
 * `unharmed` — this handler only owns the clock.
 */
export async function owComradeTickDay(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const result = tickComradeRecovery({
        remainingDays: this.actor.system.comradeRecoveryDays,
        daysElapsed: 1,
    });
    await this._updateSystemField('system.comradeRecoveryDays', result.remainingDays);
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
 * Wired to `data-action="owComradeMedicae"`. The button is `disabled`
 * unless `comradeRecoveryDays > 0`. The "one attempt per wound" RAW
 * gate is the caller's responsibility (panel state / dataset);
 * this handler defers to the rules module's arithmetic.
 */
export async function owComradeMedicae(this: Host, event: Event, _target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const dos = await promptDegreesOfSuccess();
    if (dos == null) return; // operator cancelled
    const result = applyMedicaeAttempt({
        remainingDays: this.actor.system.comradeRecoveryDays,
        degreesOfSuccess: dos,
    });
    if (result.reducedBy > 0) {
        await this._updateSystemField('system.comradeRecoveryDays', result.remainingDays);
    }
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
 * Distinct from #152's `owComradeReplace`: this handler routes
 * through the {@link processReplacement} gate, also resets the
 * recovery clock to 0 on success, and emits the healing-namespace
 * chat card so the resolution is consistent with the rest of the
 * healing engine.
 */
export async function owComradeReplace2(this: Host, event: Event, target: HTMLElement): Promise<void> {
    event.stopPropagation();
    const refitFromDataset = target.dataset['refitAvailable'] === 'true';
    const refitAvailable = refitFromDataset || this.actor.system.refitAvailable;
    const result = processReplacement({
        stateAtCamp: this.actor.system.comrade.state,
        refitAvailable,
    });
    if (result.replaced) {
        await this._updateSystemField('system.comrade.state', result.newState);
        await this._updateSystemField('system.comradeRecoveryDays', 0);
        // refit is consumed on a successful replacement: the squad
        // has burned its window of resupply. Persist that so the
        // panel correctly disables Replace until refit is re-enabled.
        await this._updateSystemField('system.refitAvailable', false);
    }
    await emitHealingChat(this, {
        kind: 'replace',
        replaced: result.replaced,
        ...(result.reason !== undefined ? { reason: result.reason } : {}),
    });
}

/* re-export the canonical constants so consumers (sheet
 * `_prepareContext`, chat card builders) read them through the
 * action module without taking a second dependency on the rules
 * file. */
export { OW_COMRADE_AUTO_RECOVERY_DAYS, OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER };
