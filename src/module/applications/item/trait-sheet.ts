/**
 * @file TraitSheet - ApplicationV2 sheet for trait items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for trait items.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class TraitSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'trait'],
        position: {
            width: 600,
            height: 720,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-trait-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
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
