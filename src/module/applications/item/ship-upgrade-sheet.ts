/**
 * @gulpfile.js ShipUpgradeSheet - ApplicationV2 sheet for ship upgrade items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for ship upgrade items.
 * Handles ship history templates, quirks, and other vessel modifications.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class ShipUpgradeSheet extends BaseItemSheet {
    /** @foundry-v14-overrides.d.ts */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'ship-upgrade'],
        position: {
            width: 600,
            height: 650,
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/ship-upgrade-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    static TABS = [
        { tab: 'details', group: 'primary', label: 'WH40K.Item.Tabs.Details' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Item.Tabs.Effects' },
    ];

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /** @foundry-v14-overrides.d.ts */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add upgrade-specific choices
        context.availabilities = this._getAvailabilityChoices();

        // Add display helpers
        // Cast context.system to Record<string, unknown> to safely access its properties
        const systemContext = context.system as Record<string, unknown>;

        context.hasModifiers = systemContext.hasModifiers;
        context.isPowerConsumer = systemContext.power > 0;
        context.isPowerGenerator = systemContext.power < 0;

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get availability choices for dropdown.
     * @returns {object} Choices object
     */
    _getAvailabilityChoices(): Record<string, string> {
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
