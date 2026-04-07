/**
 * @file CombatActionSheet - ApplicationV2 sheet for combat action items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for combat action items.
 */
export default class CombatActionSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'combat-action'],
        position: {
            width: 550,
            height: 620,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-combat-action-sheet.hbs',
            scrollable: ['.wh40k-item-body'],
        },
    };
}
