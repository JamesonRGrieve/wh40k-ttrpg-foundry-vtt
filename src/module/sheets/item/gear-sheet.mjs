import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderGearSheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 480,
            height: 380,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'details' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-gear-sheet-modern.hbs`;
    }
}
