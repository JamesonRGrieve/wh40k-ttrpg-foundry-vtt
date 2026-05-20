/**
 * Action handler module for the Deathwatch Renown panel (#164).
 *
 * The exported functions are registered into the CharacterSheet's
 * `DEFAULT_OPTIONS.actions` map by the orchestrator (see
 * `.integration-staging/164.json`). Each handler is bound such that
 * `this` provides an `actor` reference — the orchestrator either wires
 * the methods as `static` on the sheet or proxies via a sheet thunk
 * that supplies `{ actor: this.document }`.
 *
 * Each handler opens a minimal DialogV2 amount prompt, calls the pure
 * resolver (`awardRenown` / `loseRenown` from `rules/dw-renown.ts`)
 * and persists the result. The pure engine handles the floor clamp;
 * a non-positive or non-finite input is a no-op (clamped at floor).
 *
 * Renown changes are silent state — no chat card is emitted (see
 * brief: "No chat partial needed").
 */

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import { awardRenown, loseRenown } from '../rules/dw-renown.ts';

/**
 * Bind context the orchestrator supplies for these handlers. Kept
 * narrow on purpose — only the actor is needed to read & persist the
 * single `system.renown` field.
 */
export interface DwRenownActionContext {
    actor: WH40KBaseActor & { system: { renown: number } };
}

/**
 * Prompt the user for an integer Renown amount.
 *
 * Returns `null` if the dialog is dismissed, the input is empty, or
 * the parsed value is not a positive integer. The pure resolvers
 * (`awardRenown` / `loseRenown`) treat non-positive input as a no-op
 * already; we still gate here so an empty submit doesn't trigger a
 * redundant DB write.
 */
async function promptForAmount(titleKey: string): Promise<number | null> {
    const i18n = game.i18n;
    const title = i18n.localize(titleKey);
    const label = i18n.localize('WH40K.DW.Renown.Label');

    // eslint-disable-next-line no-restricted-syntax -- boundary: DialogV2.prompt return type is `unknown` per Foundry's contract; narrowed locally
    const result = (await foundry.applications.api.DialogV2.prompt({
        window: { title },
        content: `
            <div class="form-group">
                <label>${label}</label>
                <input type="number" name="amount" value="" min="1" step="1" autofocus />
            </div>
        `,
        ok: {
            callback: (_cbEvent: Event, button: HTMLButtonElement): number | null => {
                const input = button.form?.elements.namedItem('amount') as HTMLInputElement | null;
                const parsed = parseInt(input?.value ?? '', 10);
                if (!Number.isFinite(parsed) || parsed <= 0) return null;
                return parsed;
            },
        },
        rejectClose: false,
    })) as number | null | undefined;

    if (result === null || result === undefined) return null;
    if (!Number.isFinite(result) || result <= 0) return null;
    return result;
}

/**
 * `data-action="dwRenownAward"` handler. Prompts for an integer amount
 * and persists `system.renown = awardRenown(current, amount)`.
 */
export async function dwRenownAward(this: DwRenownActionContext, _event: Event, _target: HTMLElement): Promise<void> {
    const amount = await promptForAmount('WH40K.DW.Renown.Award');
    if (amount === null) return;
    const current = this.actor.system.renown;
    const next = awardRenown(current, amount);
    if (next === current) return;
    await this.actor.update({ 'system.renown': next });
}

/**
 * `data-action="dwRenownLoss"` handler. Prompts for an integer amount
 * and persists `system.renown = loseRenown(current, amount)`.
 */
export async function dwRenownLoss(this: DwRenownActionContext, _event: Event, _target: HTMLElement): Promise<void> {
    const amount = await promptForAmount('WH40K.DW.Renown.Loss');
    if (amount === null) return;
    const current = this.actor.system.renown;
    const next = loseRenown(current, amount);
    if (next === current) return;
    await this.actor.update({ 'system.renown': next });
}
