/**
 * @file WeaponSheet - ApplicationV2 sheet for weapon items
 */

import ContainerItemSheet from "./container-item-sheet.mjs";

/**
 * Sheet for weapon items with support for weapon modifications and ammunition.
 */
export default class WeaponSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["weapon"],
        position: {
            width: 520,
            height: 560
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-weapon-sheet-modern.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "stats", group: "primary", label: "Stats" },
        { tab: "description", group: "primary", label: "Description" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "stats"
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add CONFIG reference for templates
        context.CONFIG = CONFIG;
        
        return context;
    }

    /* -------------------------------------------- */

    /** @override */
    _canAddItem(item) {
        if (!super._canAddItem(item)) return false;

        // Each modification can only be added once
        if (this.item.items.some(i => i.name === item.name)) {
            ui.notifications.info(`Weapon can only hold one ${item.name}`);
            return false;
        }

        // Only one ammo type can be loaded
        if (item.type === "ammunition" && this.item.items.some(i => i.type === "ammunition")) {
            ui.notifications.info("Only one type of ammunition can be loaded.");
            return false;
        }

        return true;
    }
}
