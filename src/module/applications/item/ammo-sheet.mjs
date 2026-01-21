/**
 * @file AmmoSheet - ApplicationV2 sheet for ammunition items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for ammunition items.
 * Displays modifiers with stat bar and weapon compatibility.
 */
export default class AmmoSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'ammunition'],
        position: {
            width: 580,
            height: 660,
        },
        actions: {
            addQuality: AmmoSheet.#addQuality,
            removeAddedQuality: AmmoSheet.#removeAddedQuality,
            removeRemovedQuality: AmmoSheet.#removeRemovedQuality,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-ammo-sheet-v2.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'modifiers', group: 'primary', label: 'Modifiers' },
        { tab: 'compatibility', group: 'primary', label: 'Compatibility' },
        { tab: 'qualities', group: 'primary', label: 'Qualities' },
        { tab: 'details', group: 'primary', label: 'Details' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'modifiers',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add CONFIG reference for templates
        context.CONFIG = CONFIG;

        // Add helper for Set checking
        context.setIncludes = (value, set) => set && set.has(value);
        context.setToArray = (set) => Array.from(set || []);

        return context;
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Add a quality to added or removed list.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #addQuality(event, target) {
        const type = target.dataset.type; // 'added' or 'removed'
        const input = this.element.querySelector(`[name="new-${type}-quality"]`);
        const quality = input?.value?.trim();

        if (!quality) return;

        const field = type === 'added' ? 'addedQualities' : 'removedQualities';
        const qualities = new Set(this.item.system[field] || []);
        qualities.add(quality);

        await this.item.update({ [`system.${field}`]: Array.from(qualities) });

        // Clear input
        if (input) input.value = '';
    }

    /**
     * Remove a quality from the added list.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #removeAddedQuality(event, target) {
        const quality = target.dataset.quality;
        const qualities = new Set(this.item.system.addedQualities || []);
        qualities.delete(quality);

        await this.item.update({ 'system.addedQualities': Array.from(qualities) });
    }

    /**
     * Remove a quality from the removed list.
     * @param {Event} event   The triggering event
     * @param {HTMLElement} target The target element
     */
    static async #removeRemovedQuality(event, target) {
        const quality = target.dataset.quality;
        const qualities = new Set(this.item.system.removedQualities || []);
        qualities.delete(quality);

        await this.item.update({ 'system.removedQualities': Array.from(qualities) });
    }
}
