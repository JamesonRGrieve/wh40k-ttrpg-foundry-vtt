/**
 * @file VehicleSheet - Vehicle actor sheet using ApplicationV2
 */

import BaseActorSheet from "./base-actor-sheet.mjs";

/**
 * Actor sheet for Vehicle type actors.
 */
export default class VehicleSheet extends BaseActorSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["vehicle"],
        position: {
            width: 1000,
            height: 750
        },
        tabs: [
            { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "main" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/actor/actor-vehicle-sheet.hbs",
            scrollable: [".rt-body"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [];  // Tabs are handled by the template itself for now

    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        context.dh = CONFIG.rt;
        return context;
    }
}
