/**
 * @file WeaponQualitySheet - ApplicationV2 sheet for weapon quality items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for weapon quality items.
 */
export default class WeaponQualitySheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'weapon-quality'],
        position: {
            width: 550,
            height: 500,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-weapon-quality-sheet.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /**
     * Whether the sheet is in edit mode.
     * Compendium items are always in view mode.
     * @type {boolean}
     */
    #editMode = false;

    /* -------------------------------------------- */

    /**
     * Whether this item is from a compendium (read-only).
     * @type {boolean}
     */
    get isCompendiumItem() {
        return this.item.pack !== null;
    }

    /**
     * Whether the sheet can be edited.
     * @type {boolean}
     */
    get canEdit() {
        if (this.isCompendiumItem) return false;
        return this.isEditable;
    }

    /**
     * Whether the sheet is currently in edit mode.
     * @type {boolean}
     */
    get inEditMode() {
        if (this.isCompendiumItem) return false;
        if (!this.item.actor) return this.isEditable;
        return this.#editMode && this.isEditable;
    }

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.canEdit = this.canEdit;
        context.inEditMode = this.inEditMode;
        context.isCompendiumItem = this.isCompendiumItem;

        return context;
    }
}
