/**
 * @file JournalEntryItemSheet - ApplicationV2 sheet for journal entry items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for journal entry items (used for character notes/journals). */
const JournalEntryItemSheet = defineSimpleItemSheet({
    className: 'JournalEntryItemSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'journal-entry'],
    template: 'systems/wh40k-rpg/templates/item/item-journal-entry-sheet.hbs',
    width: 550,
    height: 500,
    tabs: [{ tab: 'content', group: 'primary', label: 'Content' }],
    defaultTab: 'content',
});

export default JournalEntryItemSheet;
