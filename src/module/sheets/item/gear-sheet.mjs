import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderGearSheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 820,
            height: 575,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-gear-sheet.hbs`;
    }
}
