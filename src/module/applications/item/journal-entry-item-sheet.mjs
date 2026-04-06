/**
 * @file JournalEntryItemSheet - ApplicationV2 sheet for journal entry items
 */

import BaseItemSheet from './base-item-sheet.mjs';

/**
 * Sheet for journal entry items (used for character notes/journals).
 */
export default class JournalEntryItemSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'journal-entry'],
        position: {
            width: 550,
            height: 500,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-journal-entry-sheet.hbs',
            scrollable: ['.rt-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [{ tab: 'content', group: 'primary', label: 'Content' }];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'content',
    };
}
