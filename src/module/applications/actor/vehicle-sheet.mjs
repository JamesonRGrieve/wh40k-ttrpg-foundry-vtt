/**
 * @file VehicleSheet - Vehicle actor sheet using ApplicationV2 with PARTS system
 */

import BaseActorSheet from "./base-actor-sheet.mjs";
import { HandlebarManager } from "../../handlebars/handlebars-manager.mjs";

/**
 * Actor sheet for Vehicle type actors.
 * Uses V2 PARTS system for modular template rendering.
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
            { navSelector: "nav.rt-navigation", contentSelector: "#tab-body", initial: "stats", group: "primary" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/actor/vehicle/header.hbs"
        },
        tabs: {
            template: "systems/rogue-trader/templates/actor/vehicle/tabs.hbs"
        },
        stats: {
            template: "systems/rogue-trader/templates/actor/vehicle/tab-stats.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        weapons: {
            template: "systems/rogue-trader/templates/actor/vehicle/tab-weapons.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        traits: {
            template: "systems/rogue-trader/templates/actor/vehicle/tab-traits.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "stats", label: "RT.Vehicle.Tabs.Stats", group: "primary", cssClass: "tab-stats" },
        { tab: "weapons", label: "RT.Vehicle.Tabs.Weapons", group: "primary", cssClass: "tab-weapons" },
        { tab: "traits", label: "RT.Vehicle.Tabs.Traits", group: "primary", cssClass: "tab-traits" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "stats"
    };

    /* -------------------------------------------- */

    /**
     * Lazy load Vehicle templates before first render.
     * @inheritDoc
     */
    async _prepareContext(options) {
        // Lazy load Vehicle-specific templates
        await HandlebarManager.loadActorSheetTemplates("vehicle");
        
        const context = await super._prepareContext(options);
        context.dh = CONFIG.rt;
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        
        // Add tab metadata for tab parts
        if (["stats", "weapons", "traits"].includes(partId)) {
            const tabConfig = this.constructor.TABS.find(t => t.tab === partId);
            context.tab = {
                id: partId,
                group: tabConfig?.group || "primary",
                active: this.tabGroups.primary === partId,
                cssClass: tabConfig?.cssClass || ""
            };
        }
        
        return context;
    }
}
