/**
 * @file VehicleSheet - Vehicle actor sheet using ApplicationV2 with PARTS system
 */

import BaseActorSheet from "./base-actor-sheet.mjs";
import { HandlebarManager } from "../../handlebars/handlebars-manager.mjs";
import ROGUE_TRADER from "../../config.mjs";

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
        actions: {
            adjustIntegrity: VehicleSheet.#adjustIntegrity,
            rollWeapon: VehicleSheet.#rollWeapon
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
        context.dh = CONFIG.rt || ROGUE_TRADER;
        
        // Categorize items
        context.weapons = this.actor.items.filter(i => i.type === 'weapon');
        context.traits = this.actor.items.filter(i => i.type === 'vehicleTrait');
        context.upgrades = this.actor.items.filter(i => i.type === 'vehicleUpgrade');
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    async _preparePartContext(partId, context, options) {
        // Get shared context from _prepareContext
        const sharedContext = await this._prepareContext(options);
        context = { ...sharedContext, ...context };
        
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

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Adjust vehicle integrity value.
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #adjustIntegrity(event, target) {
        const delta = parseInt(target.dataset.delta) || 0;
        const current = this.actor.system.integrity.value;
        const max = this.actor.system.integrity.max;
        
        const newValue = Math.max(0, Math.min(max, current + delta));
        
        await this.actor.update({ "system.integrity.value": newValue });
        
        // Visual feedback
        if (delta < 0) {
            this._flashElement(target, 'damage');
        } else {
            this._flashElement(target, 'healing');
        }
    }

    /**
     * Roll a vehicle weapon attack.
     * @param {Event} event - The triggering event
     * @param {HTMLElement} target - The action target
     */
    static async #rollWeapon(event, target) {
        const itemId = target.dataset.itemId;
        if (!itemId) return;
        
        const item = this.actor.items.get(itemId);
        if (!item) return;
        
        // Use the vehicle's rollItem method
        await this.actor.rollItem(itemId);
    }
}
