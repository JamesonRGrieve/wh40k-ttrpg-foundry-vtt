import { AcolyteSheet } from './acolyte-sheet.mjs';

export class NpcSheet extends AcolyteSheet {
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 1000,
            height: 750,
            resizable: true,
            submitOnChange: true,
            tabs: [{ navSelector: '.rt-navigation', contentSelector: '.rt-body', initial: 'main' }],
        });
    }

    get template() {
        return `systems/rogue-trader/templates/actor/actor-npc-sheet.hbs`;
    }
}
