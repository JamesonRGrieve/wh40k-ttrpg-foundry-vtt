import { DarkHeresyItemSheet } from './item-sheet.mjs';

export class DarkHeresyPeerEnemySheet extends DarkHeresyItemSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 800,
            height: 340,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'stats' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/item/item-peer-enemy-sheet.hbs`;
    }
}
