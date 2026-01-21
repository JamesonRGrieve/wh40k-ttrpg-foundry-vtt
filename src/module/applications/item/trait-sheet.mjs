/**
 * @file TraitSheet - ApplicationV2 sheet for trait items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for trait items.
 */
export default class TraitSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'trait'],
        position: {
            width: 600,
            height: 720,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-trait-sheet-modern.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'properties', group: 'primary', label: 'Properties' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'properties',
    };
}
