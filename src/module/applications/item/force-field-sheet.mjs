/**
 * @file ForceFieldSheet - ApplicationV2 sheet for force field items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for force field items.
 */
export default class ForceFieldSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'force-field'],
        position: {
            width: 540,
            height: 620,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-force-field-sheet-v2.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'stats', group: 'primary', label: 'Stats' },
        { tab: 'description', group: 'primary', label: 'Info' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'stats',
    };

    /* -------------------------------------------- */
}
