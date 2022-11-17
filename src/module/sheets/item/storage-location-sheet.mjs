import { DarkHeresyItemContainerSheet } from './item-container-sheet.mjs';

export class DarkHeresyStorageLocationSheet extends DarkHeresyItemContainerSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 800,
            height: 400,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'items' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/item/item-storage-location-sheet.hbs`;
    }
}
