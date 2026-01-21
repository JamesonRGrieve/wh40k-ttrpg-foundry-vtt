/**
 * @file CyberneticSheet - ApplicationV2 sheet for cybernetic items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for cybernetic/augmetic items.
 */
export default class CyberneticSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['rogue-trader', 'sheet', 'item', 'cybernetic'],
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/rogue-trader/templates/item/item-cybernetic-sheet-v2.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'properties', group: 'primary', label: 'Properties' },
        { tab: 'installation', group: 'primary', label: 'Installation' },
        { tab: 'modifiers', group: 'primary', label: 'Modifiers' },
        { tab: 'description', group: 'primary', label: 'Info' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'properties',
    };

    /* -------------------------------------------- */
}
