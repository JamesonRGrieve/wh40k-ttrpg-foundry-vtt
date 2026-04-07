/**
 * @file PeerEnemySheet - ApplicationV2 sheet for peer/enemy items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for peer and enemy items.
 */
export default class PeerEnemySheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'peer-enemy'],
        position: {
            width: 500,
            height: 380,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-peer-enemy-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
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
