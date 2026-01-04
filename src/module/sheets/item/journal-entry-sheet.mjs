import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderJournalEntrySheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 800,
            height: 350,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-journal-entry-sheet.hbs`;
    }
}
