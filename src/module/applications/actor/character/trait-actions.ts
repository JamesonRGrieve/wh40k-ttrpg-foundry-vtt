/**
 * Character sheet: trait actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import type CharacterSheet from '../character-sheet.ts';

/**
 * Filter traits list.
 * @param {Event} event  Triggering event
 * @param {HTMLElement} target  The input/select element
 * @this {CharacterSheet}
 * @private
 */
export async function filterTraits(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const form = target.closest('.wh40k-traits-filters');
    if (!form) return;

    const search = form.querySelector<HTMLInputElement>('[name=traits-search]')?.value ?? '';
    const category = form.querySelector<HTMLSelectElement>('[name=traits-category]')?.value ?? '';
    const hasLevel = form.querySelector<HTMLInputElement>('[name=traits-has-level]')?.checked ?? false;

    this._traitsFilter = { search, category, hasLevel };
    await this.render({ parts: ['skills'] }); // Trait panel is in skills tab
}

/**
 * Clear traits filter.
 * @param {Event} event  Triggering event
 * @param {HTMLElement} target  The button clicked
 * @this {CharacterSheet}
 * @private
 */
export async function clearTraitsFilter(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    this._traitsFilter = { search: '', category: '', hasLevel: false };
    await this.render({ parts: ['skills'] }); // Trait panel is in skills tab
}

/**
 * Adjust trait level.
 * @param {Event} event  Triggering event
 * @param {HTMLElement} target  The button clicked
 * @this {CharacterSheet}
 * @private
 */
export async function adjustTraitLevel(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const itemId = target.dataset['itemId'];
    const parsedDelta = parseInt(target.dataset['delta'] ?? '');
    const delta = Number.isNaN(parsedDelta) ? 0 : parsedDelta;

    if (itemId === undefined || itemId === '') return;
    const item = this.actor.items.get(itemId);
    if (item === undefined) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is Foundry DataModel; level not on base type; bracket access needs Record cast
    const levelNum = Number((item.system as Record<string, unknown>)['level']);
    const newLevel = Math.max(0, (Number.isNaN(levelNum) ? 0 : levelNum) + delta);
    await item.update({ 'system.level': newLevel });

    // Provide visual feedback
    ui.notifications.info(
        game.i18n.format(delta > 0 ? 'WH40K.Notify.Item.LevelIncreased' : 'WH40K.Notify.Item.LevelDecreased', { item: item.name, level: String(newLevel) }),
    );
}
