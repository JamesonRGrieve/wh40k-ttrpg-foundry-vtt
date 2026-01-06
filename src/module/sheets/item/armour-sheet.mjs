import { RogueTraderItemContainerSheet } from './item-container-sheet.mjs';

export class RogueTraderArmourSheet extends RogueTraderItemContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 520,
            height: 480,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'protection' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-armour-sheet-modern.hbs`;
    }
}
