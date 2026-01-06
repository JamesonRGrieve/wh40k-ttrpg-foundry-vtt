import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderTraitSheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 520,
            height: 480,
            resizable: true,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'description' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-trait-sheet-modern.hbs`;
    }
}
