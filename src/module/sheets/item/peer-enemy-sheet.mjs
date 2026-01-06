import { RogueTraderItemSheet } from './item-sheet.mjs';

export class RogueTraderPeerEnemySheet extends RogueTraderItemSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 800,
            height: 340,
            tabs: [{ navSelector: '.rt-navigation', contentSelector: '.rt-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-peer-enemy-sheet.hbs`;
    }
}
