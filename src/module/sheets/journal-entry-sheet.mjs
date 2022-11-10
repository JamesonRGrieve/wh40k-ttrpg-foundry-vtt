import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyJournalEntrySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 800,
            height: 350,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/item/item-journal-entry-sheet.hbs`;
    }
}
