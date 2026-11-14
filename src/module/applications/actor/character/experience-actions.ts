/**
 * Character sheet: experience actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { DHBasicActionManager } from '../../../actions/basic-action-manager.ts';
import { firstSystemId } from '../../../utils/chat-system-id.ts';
import { errorMessage } from '../../../utils/error-message.ts';
import AdvancementDialog from '../../dialogs/advancement-dialog.ts';
import type CharacterSheet from '../character-sheet.ts';

/**
 * Handle custom XP addition/subtraction.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function customXP(this: CharacterSheet, event: Event, _target: HTMLElement): Promise<void> {
    event.preventDefault();
    const { openAddXPDialog } = await import('../../prompts/add-xp-dialog.ts');
    openAddXPDialog(this.actor);
}

/**
 * Open the advancement dialog for spending XP.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export function openAdvancement(this: CharacterSheet, event: Event, _target: HTMLElement): void {
    event.preventDefault();
    // Default to rogueTrader career for now
    // TODO: Get career from actor.system.originPath.career or rogueTrader.careerPath
    const careerKey = this.actor.originPath['career'];
    AdvancementDialog.open(this.actor, { careerKey });
}

/**
 * Handle bonus vocalize.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function bonusVocalize(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const bonusName = target.dataset['bonusName'];
        const bonus = (this.actor.backgroundEffects as Array<{ name?: string; source?: string; benefit?: string }> | undefined)?.find(
            (a) => a.name === bonusName,
        );
        if (bonus) {
            await DHBasicActionManager.sendItemVocalizeChat({
                actor: this.actor.name,
                name: bonus.name,
                type: bonus.source,
                description: bonus.benefit,
                _gameSystemId: firstSystemId(this.actor),
            });
        } else {
            this._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.BonusNotFound', { name: bonusName ?? '' }), {
                duration: 3000,
            });
        }
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.BonusVocalizeFailed', { error: errorMessage(error) }), {
            duration: 5000,
        });
        console.error('Bonus vocalize error:', error);
    }
}
