import {DarkHeresyItemSheet} from "./item-sheet.mjs";
import {DarkHeresyContainerSheet} from "./container-sheet.mjs";

export class DarkHeresyWeaponSheet extends DarkHeresyContainerSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 820,
            height: 575,
            tabs: [{ navSelector: ".dh-navigation", contentSelector: ".dh-body", initial: "stats" }]
        });
    }

    canAdd(itemData) {
        if(!super.canAdd(itemData)) {
            return false;
        }
        // Every item can only be added once for weapons
        if (this.item.items.some(i => i.name === itemData.name)) {
            ui.notifications.info("Weapon can only hold one " + itemData.name);
            return false;
        }

        // Only one ammo can be loaded
        if (this.item.items.some(i => i.type === 'ammunition')) {
            ui.notifications.info("Only one type of ammunition can be loaded.");
            return false;
        }

        return true;
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/item/item-weapon-sheet.hbs`;
    }
}
