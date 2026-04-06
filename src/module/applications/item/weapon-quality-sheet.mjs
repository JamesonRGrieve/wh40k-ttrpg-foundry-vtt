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
        classes: ['wh40k-rpg', 'sheet', 'item', 'weapon-quality'],
        position: {
            width: 550,
            height: 500,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-weapon-quality-sheet.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'effect', group: 'primary', label: 'Effect' },
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'effect',
    };
}
