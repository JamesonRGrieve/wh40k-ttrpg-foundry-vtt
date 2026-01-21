/**
 * @file CriticalInjurySheet - ApplicationV2 sheet for critical injury items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for critical injury items.
 * Displays injury details with severity slider and body location visual.
 */
export default class CriticalInjurySheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'critical-injury'],
        position: {
            width: 560,
            height: 620,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-critical-injury-sheet-v2.hbs',
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
    /*  Context Preparation                         */
    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        // Add injury-specific context
        context.damageTypes = {
            impact: 'Impact',
            rending: 'Rending',
            explosive: 'Explosive',
            energy: 'Energy',
        };

        context.bodyParts = {
            head: 'Head',
            arm: 'Arm',
            body: 'Body',
            leg: 'Leg',
        };

        return context;
    }
}
