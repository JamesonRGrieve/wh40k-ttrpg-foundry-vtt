import { RogueTraderItemContainerSheet } from './item-container-sheet.mjs';

export class RogueTraderStorageLocationSheet extends RogueTraderItemContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 800,
            height: 400,
            tabs: [{ navSelector: '.rt-navigation', contentSelector: '.rt-body', initial: 'items' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-storage-location-sheet.hbs`;
    }
}
