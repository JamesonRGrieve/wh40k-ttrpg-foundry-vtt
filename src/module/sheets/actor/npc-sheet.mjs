import { AcolyteSheet } from './acolyte-sheet.mjs';

export class NpcSheet extends AcolyteSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 1000,
            height: 750,
            resizable: true,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'main' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/actor/actor-npc-sheet.hbs`;
    }
}
