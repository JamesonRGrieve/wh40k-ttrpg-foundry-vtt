import { RogueTraderItemContainerSheet } from './item-container-sheet.mjs';

export class RogueTraderPsychicPowerSheet extends RogueTraderItemContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 820,
            height: 575,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-psychic-power-sheet.hbs`;
    }
}
