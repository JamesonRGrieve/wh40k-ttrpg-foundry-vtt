import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderTalentSheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 520,
            height: 420,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'details' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-talent-sheet-modern.hbs`;
    }
}
