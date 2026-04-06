/**
 * @file PsychicPowerSheet - ApplicationV2 sheet for psychic power items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for psychic power items.
 */
export default class PsychicPowerSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'psychic-power'],
        position: {
            width: 550,
            height: 500,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-psychic-power-sheet-modern.hbs',
            scrollable: ['.rt-tab-content'],
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
}
