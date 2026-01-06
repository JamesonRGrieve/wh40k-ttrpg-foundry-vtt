import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderSkillSheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 560,
            height: 650,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'details' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-skill-sheet-modern.hbs`;
    }
}
