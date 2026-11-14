/**
 * Character sheet: psychic, navigator and other power actions.
 *
 * Split out of `character-sheet.ts` (#716): `this`-typed handlers the sheet binds in
 * `DEFAULT_OPTIONS.actions`; ApplicationV2 calls each with the sheet as `this`.
 */
import { errorMessage } from '../../../utils/error-message.ts';
import type CharacterSheet from '../character-sheet.ts';

/**
 * Shared roll handler for power / ritual / order list controls. They
 * differed only by the notify label and console tag; homologated to all
 * surface a "<label> not found" warning.
 */
async function rollItemAction(sheet: CharacterSheet, target: HTMLElement, label: string): Promise<void> {
    try {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        const item = sheet.actor.items.get(itemId);
        if (item === undefined) {
            sheet._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.ItemNotFound', { label }), { duration: 3000 });
            return;
        }
        await sheet.actor.rollItem(itemId);
    } catch (error) {
        sheet._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.ItemRollFailed', { label, error: errorMessage(error) }), { duration: 5000 });
        console.error(`${label} roll error:`, error);
    }
}

/**
 * Shared vocalize-to-chat handler for power / ritual / order controls.
 * Differed only by the chat-card CSS class and notify label.
 */
async function vocalizeItemAction(sheet: CharacterSheet, target: HTMLElement, label: string, cssClass: string): Promise<void> {
    try {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        const item = sheet.actor.items.get(itemId);
        if (item === undefined) {
            sheet._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.ItemNotFound', { label }), { duration: 3000 });
            return;
        }

        if (typeof item.toChat === 'function') {
            await item.toChat();
        } else {
            await ChatMessage.create({
                speaker: ChatMessage.getSpeaker({ actor: sheet.actor }),
                content: `<div class="${cssClass}"><h3>${item.name}</h3><p>${item.system.description.value}</p></div>`,
            });
        }
    } catch (error) {
        sheet._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.ItemPostFailed', { label: label.toLowerCase(), error: errorMessage(error) }), {
            duration: 5000,
        });
        console.error(`Vocalize ${label.toLowerCase()} error:`, error);
    }
}

/**
 * Handle rolling a psychic or navigator power.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollPower(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await rollItemAction(this, target, game.i18n.localize('WH40K.NavigatorPowers.Name'));
}

/**
 * Handle rolling damage for an attack power.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollPowerDamage(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    try {
        const itemId = target.dataset['itemId'];
        if (itemId === undefined || itemId === '') return;
        const item = this.actor.items.get(itemId);
        if (item === undefined) {
            this._notify('warning', game.i18n.format('WH40K.Notify.CharacterSheet.ItemNotFound', { label: game.i18n.localize('WH40K.NavigatorPowers.Name') }), {
                duration: 3000,
            });
            return;
        }

        // Use the actor's damageItem method
        await this.actor.damageItem(itemId);
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.DamageRollFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Power damage error:', error);
    }
}

/**
 * Handle vocalizing a power to chat.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function vocalizePower(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await vocalizeItemAction(this, target, game.i18n.localize('WH40K.NavigatorPowers.Name'), 'wh40k-power-chat');
}

/**
 * Handle toggling power details expansion.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export function togglePowerDetails(this: CharacterSheet, _event: Event, target: HTMLElement): void {
    const itemId = target.dataset['itemId'];
    const detailsEl = this.element.querySelector(`.wh40k-power-details[data-power-id="${itemId}"]`);

    if (detailsEl) {
        const isHidden = detailsEl.hasAttribute('hidden');
        if (isHidden) {
            detailsEl.removeAttribute('hidden');
            target.classList.add('expanded');
        } else {
            detailsEl.setAttribute('hidden', '');
            target.classList.remove('expanded');
        }
    }
}

/**
 * Handle rolling a ritual.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollRitual(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await rollItemAction(this, target, game.i18n.localize('WH40K.Rituals.Name'));
}

/**
 * Handle vocalizing a ritual to chat.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function vocalizeRitual(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await vocalizeItemAction(this, target, game.i18n.localize('WH40K.Rituals.Name'), 'wh40k-ritual-chat');
}

/**
 * Handle rolling an order.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollOrder(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await rollItemAction(this, target, game.i18n.localize('WH40K.Orders.Name'));
}

/**
 * Handle vocalizing an order to chat.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function vocalizeOrder(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    await vocalizeItemAction(this, target, game.i18n.localize('WH40K.Orders.Name'), 'wh40k-order-chat');
}

/**
 * Handle rolling psychic phenomena.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollPhenomena(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        // Use the game.wh40k roll helper if available
        if (typeof game.wh40k.rollPsychicPhenomena === 'function') {
            await game.wh40k.rollPsychicPhenomena(this.actor);
        } else {
            // Fallback: roll on phenomena table
            /* eslint-disable no-restricted-syntax -- boundary: game.packs.getDocuments() returns untyped Foundry documents; cast to locate table by name and invoke draw() */
            const table = (game.tables.getName('Psychic Phenomena') ??
                (await game.packs
                    .get('wh40k-rpg.wh40k-rolltables-psychic')
                    ?.getDocuments()
                    .then((docs: unknown[]) => docs.find((d: unknown) => (d as { name: string }).name.includes('Phenomena'))))) as
                | { draw: () => Promise<unknown> }
                | undefined;
            /* eslint-enable no-restricted-syntax */

            if (table) {
                await table.draw();
            } else {
                // Simple d100 roll as last resort
                const roll = await new Roll('1d100').evaluate();
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="wh40k-phenomena-roll"><h3>${game.i18n.localize('WH40K.QuickActions.PsychicPhenomena')}</h3><p>${game.i18n.format(
                        'WH40K.Roll.RollResult',
                        { total: String(roll.total) },
                    )}</p></div>`,
                    rolls: [roll],
                });
            }
        }
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.PhenomenaFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Phenomena roll error:', error);
    }
}

/**
 * Handle rolling perils of the warp.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function rollPerils(this: CharacterSheet, _event: Event, _target: HTMLElement): Promise<void> {
    try {
        // Use the game.wh40k roll helper if available
        if (typeof game.wh40k.rollPerilsOfTheWarp === 'function') {
            await game.wh40k.rollPerilsOfTheWarp(this.actor);
        } else {
            // Fallback: roll on perils table
            /* eslint-disable no-restricted-syntax -- boundary: game.packs.getDocuments() returns untyped Foundry documents; cast to locate table by name and invoke draw() */
            const table = (game.tables.getName('Perils of the Warp') ??
                (await game.packs
                    .get('wh40k-rpg.wh40k-rolltables-psychic')
                    ?.getDocuments()
                    .then((docs: unknown[]) => docs.find((d: unknown) => (d as { name: string }).name.includes('Perils'))))) as
                | { draw: () => Promise<unknown> }
                | undefined;

            /* eslint-enable no-restricted-syntax */
            if (table) {
                await table.draw();
            } else {
                // Simple d100 roll as last resort
                const roll = await new Roll('1d100').evaluate();
                await ChatMessage.create({
                    speaker: ChatMessage.getSpeaker({ actor: this.actor }),
                    content: `<div class="wh40k-perils-roll"><h3>${game.i18n.localize('WH40K.QuickActions.PerilsOfTheWarp')}</h3><p>${game.i18n.format(
                        'WH40K.Roll.RollResult',
                        { total: String(roll.total) },
                    )}</p></div>`,
                    rolls: [roll],
                });
            }
        }
    } catch (error) {
        this._notify('error', game.i18n.format('WH40K.Notify.CharacterSheet.PerilsFailed', { error: errorMessage(error) }), { duration: 5000 });
        console.error('Perils roll error:', error);
    }
}

/**
 * Handle filtering orders by category.
 * @this {CharacterSheet}
 * @param {Event} event         Triggering click event.
 * @param {HTMLElement} target  Button that was clicked.
 */
export async function filterOrders(this: CharacterSheet, _event: Event, target: HTMLElement): Promise<void> {
    const category = target.dataset['category'] ?? '';

    this._orderCategoryFilter = category;

    // Update active class on filter buttons
    const filterBtns = this.element.querySelectorAll('.wh40k-panel-orders .wh40k-filter-btn');
    filterBtns.forEach((btn: Element) => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset['category'] === category);
    });

    // The ship-orders panel lives on the Combat tab (#194).
    await this.render({ parts: ['combat'] });
}
