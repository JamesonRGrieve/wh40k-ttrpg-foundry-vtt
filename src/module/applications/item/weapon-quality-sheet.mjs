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
        classes: ['weapon-quality'],
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
}
