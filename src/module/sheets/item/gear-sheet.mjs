import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';

export class DarkHeresyGearSheet extends DarkHeresyItemContainerSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 820,
            height: 575,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/item/item-gear-sheet.hbs`;
    }
}
