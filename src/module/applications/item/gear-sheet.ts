/**
 * @file GearSheet - ApplicationV2 sheet for gear/consumable/drug/tool items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for gear items (consumables, drugs, tools, etc.).
 */
// @ts-expect-error - TS2417 static side inheritance
export default class GearSheet extends BaseItemSheet {
    [key: string]: any;
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'gear'],
        actions: {
            resetUses: GearSheet.#onResetUses,
            consumeUse: GearSheet.#onConsumeUse,
        },
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-gear-sheet-v2.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'overview', group: 'primary', label: 'Overview' },
        { tab: 'usage', group: 'primary', label: 'Usage' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'overview',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add gear-specific computed properties to context
        context.categoryLabel = this.item.system.categoryLabel;
        context.categoryIcon = this.item.system.categoryIcon;
        context.hasLimitedUses = this.item.system.hasLimitedUses;
        context.usesExhausted = this.item.system.usesExhausted;
        context.usesDisplay = this.item.system.usesDisplay;

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Handle reset uses action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onResetUses(this: any, event: Event, target: HTMLElement): Promise<void> {
        await this.item.system.resetUses();
    }

    /**
     * Handle consume use action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onConsumeUse(event: Event, target: HTMLElement): Promise<void> {
        // @ts-expect-error - TS2339
        await this.item.system.consume();
    }
}
