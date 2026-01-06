import { RogueTraderItemContainerSheet } from './item-container-sheet.mjs';

export class RogueTraderPsychicPowerSheet extends RogueTraderItemContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 540,
            height: 520,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'power' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-psychic-power-sheet-modern.hbs`;
    }
}
