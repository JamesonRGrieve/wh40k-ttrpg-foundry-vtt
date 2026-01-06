import { RogueTraderItemContainerSheet } from './item-container-sheet.mjs';

export class RogueTraderWeaponSheet extends RogueTraderItemContainerSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            classes: ['rogue-trader', 'sheet', 'item', 'rt-item-sheet'],
            width: 520,
            height: 560,
            tabs: [{ navSelector: '.rt-tabs', contentSelector: '.rt-tab-content', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/item/item-weapon-sheet-modern.hbs`;
    }

    canAdd(itemData) {
        if (!super.canAdd(itemData)) {
            return false;
        }
        // Every item can only be added once for weapons
        if (this.item.items.some((i) => i.name === itemData.name)) {
            ui.notifications.info('Weapon can only hold one ' + itemData.name);
            return false;
        }

        // Only one ammo can be loaded
        if (itemData.type === 'ammunition' && this.item.items.some((i) => i.type === 'ammunition')) {
            ui.notifications.info('Only one type of ammunition can be loaded.');
            return false;
        }

        return true;
    }
}
