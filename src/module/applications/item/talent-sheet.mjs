/**
 * @file TalentSheet - ApplicationV2 sheet for talent items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for talent items.
 */
export default class TalentSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'talent'],
        position: {
            width: 600,
            height: 720,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-talent-sheet-modern.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'properties', group: 'primary', label: 'Properties' },
        { tab: 'prerequisites', group: 'primary', label: 'Prerequisites' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'properties',
    };

    /* -------------------------------------------- */
}
