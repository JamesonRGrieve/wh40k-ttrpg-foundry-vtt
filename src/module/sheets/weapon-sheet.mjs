import {DarkHeresyItemSheet} from "./item-sheet.mjs";

export class DarkHeresyWeaponSheet extends DarkHeresyItemSheet {

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 690,
            height: 600,
            tabs: [{ navSelector: ".dh-navigation", contentSelector: ".dh-body", initial: "description" }]
        });
    }

    get template() {
        const path = "systems/dark-heresy-2nd/templates/item";
        return `${path}/item-weapon-sheet.hbs`;
    }
}
