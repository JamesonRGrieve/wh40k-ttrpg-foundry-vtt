/**
 * @file ForceFieldSheet - ApplicationV2 sheet for force field items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for force field items.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class ForceFieldSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'force-field'],
        position: {
            width: 540,
            height: 620,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-force-field-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
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
