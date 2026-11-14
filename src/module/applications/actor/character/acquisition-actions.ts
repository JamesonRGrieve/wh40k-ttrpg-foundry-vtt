/**
 * Character sheet: acquisition actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import type CharacterSheet from '../character-sheet.ts';

/**
 * Handle adding an acquisition.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function addAcquisition(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    const acquisitions = this.actor.system.rogueTrader?.acquisitions;
    const acquisitionList = Array.isArray(acquisitions) ? acquisitions : [];
    const updatedAcquisitions = structuredClone(acquisitionList);
    // Blank `uuid`: a hand-added row is a note, not a record of a real
    // acquisition. Rows written by an actual acquisition test carry the item
    // that changed hands and render as a link instead (#496).
    updatedAcquisitions.push({ name: '', availability: '', modifier: 0, notes: '', acquired: false, uuid: '' });
    await this.actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
}

/**
 * Open the item an acquisition row records (#496).
 * @this {CharacterSheet}
 * @param {Event} _event  Triggering click.
 * @param {HTMLElement} target  The row's link, carrying the item uuid.
 */
export async function openAcquisition(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const uuid = target.dataset['uuid'];
    if (uuid === undefined || uuid === '') return;
    // eslint-disable-next-line no-restricted-syntax -- boundary: `fromUuid` is a Foundry global resolving to an untyped Document union
    const item = (await fromUuid(uuid)) as { sheet?: { render: (force: boolean) => unknown } } | null;
    item?.sheet?.render(true);
}

/**
 * Handle removing an acquisition.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function removeAcquisition(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const index = parseInt(target.dataset['index'] ?? '-1', 10);
    if (Number.isNaN(index) || index < 0) return;

    const acquisitions = this.actor.system.rogueTrader?.acquisitions;
    if (!Array.isArray(acquisitions)) {
        await this.actor.update({ 'system.rogueTrader.acquisitions': [] });
        return;
    }

    const updatedAcquisitions = structuredClone(acquisitions);
    updatedAcquisitions.splice(index, 1);
    await this.actor.update({ 'system.rogueTrader.acquisitions': updatedAcquisitions });
}
