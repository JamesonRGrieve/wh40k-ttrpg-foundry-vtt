/**
 * @file ConditionSheet - ApplicationV2 sheet for condition items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for condition items (status effects).
 * Displays condition properties with nature-based color coding.
 */
export default class ConditionSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'condition'],
        position: {
            width: 560,
            height: 640,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-condition-sheet-v2.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add condition-specific context
        context.natures = {
            beneficial: 'Beneficial',
            harmful: 'Harmful',
            neutral: 'Neutral',
        };

        context.appliesTo = {
            self: 'Self',
            target: 'Target',
            both: 'Both',
            area: 'Area',
        };

        return context;
    }
}
