/**
 * @file CyberneticSheet - ApplicationV2 sheet for cybernetic items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for cybernetic/augmetic items.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class CyberneticSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'cybernetic'],
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-cybernetic-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
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
