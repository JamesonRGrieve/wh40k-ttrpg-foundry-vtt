/**
 * @file JournalEntryItemSheet - ApplicationV2 sheet for journal entry items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { JOURNAL_ENTRY_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** Sheet for journal entry items (used for character notes/journals). */
const JournalEntryItemSheet = defineSimpleItemSheet({
    className: 'JournalEntryItemSheet',
    schemaLayout: JOURNAL_ENTRY_EXTRA_LAYOUT,
    classes: ['wh40k-rpg', 'sheet', 'item', 'journal-entry'],
    template: 'systems/wh40k-rpg/templates/item/item-journal-entry-sheet.hbs',
    width: 550,
    height: 500,
    tabs: [{ tab: 'content', group: 'primary', label: 'WH40K.Tabs.Content' }],
    defaultTab: 'content',
});

export default JournalEntryItemSheet;
