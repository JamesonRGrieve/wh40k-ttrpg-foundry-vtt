import { ActorContainerSheet } from './actor-container-sheet.mjs';

export class VehicleSheet extends ActorContainerSheet {
    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            width: 1000,
            height: 750,
            resizable: true,
            tabs: [{ navSelector: '.dh-navigation', contentSelector: '.dh-body', initial: 'main' }],
        });
    }

    get template() {
        return `systems/dark-heresy-2nd/templates/actor/actor-vehicle-sheet.hbs`;
    }

    getData() {
        const context = super.getData();
        context.dh = CONFIG.dh;
        return context;
    }

    async _onItemDamage(event) {
        event.preventDefault();
        const div = $(event.currentTarget);
        game.dh.warn('Not Implemented for Vehicles Yet');
    }

}
