/**
 * @file WeaponQualitySheet - ApplicationV2 sheet for weapon quality items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for weapon quality items.
 */
// @ts-expect-error - TS2417 static side inheritance
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
            scrollable: ['.wh40k-tab-content'],
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
