/**
 * Character sheet: talent actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import type CharacterSheet from '../character-sheet.ts';

/**
 * Toggle favorite status for a talent.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering event.
 * @param {HTMLElement} target  Element that triggered the event.
 */
export async function toggleFavoriteTalent(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const itemId = target.dataset['itemId'];
    if (itemId === undefined || itemId === '') return;
    await this._toggleFavorite('favoriteTalents', itemId, ['overview', 'skills']);
}
