/**
 * Character sheet: create, toggle and delete Active Effects, with the sheet's notifications.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { errorMessage } from '../../../utils/error-message.ts';
import * as EffectActions from '../../api/effect-actions.ts';
import ConfirmationDialog from '../../dialogs/confirmation-dialog.ts';
import EffectCreationDialog from '../../prompts/effect-creation-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';

/**
 * Handle creating a new Active Effect.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function createEffect(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        // The effect-creation dialog builds a real effect (a line-resolved
        // condition, or a characteristic / skill / combat modifier with its
        // duration) instead of a blank, change-less one. Dismissal creates nothing.
        const effect = await EffectCreationDialog.show(this.effectsOwner);
        if (effect === null) return;

        this._notify('info', game.i18n.localize('WH40K.Notify.CharacterSheet.EffectCreated'), {
            duration: 2000,
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.EffectCreateFailed', { error: errorMessage(error) }), {
            duration: 5000,
        });
        console.error('Create effect error:', error);
    }
}

/**
 * Handle toggling an Active Effect's enabled/disabled state.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function toggleEffect(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const effect = EffectActions.resolveEffect(this.effectsOwner, target);

        if (effect === undefined) {
            this._notify('warning', game.i18n.localize('WH40K.Notify.CharacterSheet.EffectNotFound'), {
                duration: 3000,
            });
            return;
        }

        await effect.update({ disabled: !effect.disabled });

        this._notify('info', game.i18n.localize(effect.disabled ? 'WH40K.Notify.CharacterSheet.EffectDisabled' : 'WH40K.Notify.CharacterSheet.EffectEnabled'), {
            duration: 2000,
        });
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.EffectToggleFailed', { error: errorMessage(error) }), {
            duration: 5000,
        });
        console.error('Toggle effect error:', error);
    }
}

/**
 * Handle deleting an Active Effect.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function deleteEffect(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const effect = EffectActions.resolveEffect(this.effectsOwner, target);

        if (effect === undefined) {
            this._notify('warning', game.i18n.localize('WH40K.Notify.CharacterSheet.EffectNotFound'), {
                duration: 3000,
            });
            return;
        }

        const confirmed = await ConfirmationDialog.confirm({
            title: game.i18n.localize('WH40K.Notify.CharacterSheet.DeleteEffectTitle'),
            content: game.i18n.format('WH40K.Notify.CharacterSheet.DeleteEffectContent', { name: effect.name ?? '' }),
            confirmLabel: game.i18n.localize('WH40K.Common.Delete'),
            cancelLabel: game.i18n.localize('WH40K.Cancel'),
        });

        if (confirmed) {
            await effect.delete();
            this._notify('info', game.i18n.localize('WH40K.Notify.CharacterSheet.EffectDeleted'), {
                duration: 2000,
            });
        }
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.EffectDeleteFailed', { error: errorMessage(error) }), {
            duration: 5000,
        });
        console.error('Delete effect error:', error);
    }
}
