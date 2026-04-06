/**
 * @file ShipUpgradeSheet - ApplicationV2 sheet for ship upgrade items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for ship upgrade items.
 * Handles ship history templates, quirks, and other vessel modifications.
 */
export default class ShipUpgradeSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'ship-upgrade'],
        position: {
            width: 600,
            height: 650,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/ship-upgrade-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'details', group: 'primary', label: 'WH40K.Item.Tabs.Details' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Item.Tabs.Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add upgrade-specific choices
        context.availabilities = this._getAvailabilityChoices();

        // Add display helpers
        context.hasModifiers = context.system.hasModifiers;
        context.isPowerConsumer = context.system.power > 0;
        context.isPowerGenerator = context.system.power < 0;

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get availability choices for dropdown.
     * @returns {object} Choices object
     */
    _getAvailabilityChoices() {
        return {
            'ubiquitous': game.i18n.localize('WH40K.Availability.Ubiquitous'),
            'abundant': game.i18n.localize('WH40K.Availability.Abundant'),
            'plentiful': game.i18n.localize('WH40K.Availability.Plentiful'),
            'common': game.i18n.localize('WH40K.Availability.Common'),
            'average': game.i18n.localize('WH40K.Availability.Average'),
            'scarce': game.i18n.localize('WH40K.Availability.Scarce'),
            'rare': game.i18n.localize('WH40K.Availability.Rare'),
            'very-rare': game.i18n.localize('WH40K.Availability.VeryRare'),
            'extremely-rare': game.i18n.localize('WH40K.Availability.ExtremelyRare'),
            'near-unique': game.i18n.localize('WH40K.Availability.NearUnique'),
            'unique': game.i18n.localize('WH40K.Availability.Unique'),
        };
    }
}
