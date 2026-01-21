/**
 * @file ShipComponentSheet - ApplicationV2 sheet for ship component items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for ship component items.
 * Handles essential components, supplemental systems, bridges, drives, etc.
 */
export default class ShipComponentSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["rogue-trader", "sheet", "item", "ship-component"],
        position: {
            width: 600,
            height: 700
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/ship-component-sheet.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "details", group: "primary", label: "RT.Item.Tabs.Details" },
        { tab: "effects", group: "primary", label: "RT.Item.Tabs.Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };

    /* -------------------------------------------- */

    /** @override */
    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        
        // Add component-specific choices
        context.componentTypes = this._getComponentTypeChoices();
        context.hullTypes = this._getHullTypeChoices();
        context.availabilities = this._getAvailabilityChoices();
        context.conditions = this._getConditionChoices();
        
        // Add display helpers
        context.isGenerator = context.system.power?.generated > 0;
        context.isPowerConsumer = context.system.power?.used > 0;
        context.hasModifiers = context.system.hasModifiers;
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get component type choices for dropdown.
     * @returns {object} Choices object
     */
    _getComponentTypeChoices() {
        return {
            essential: game.i18n.localize("RT.ShipComponent.Type.Essential"),
            supplemental: game.i18n.localize("RT.ShipComponent.Type.Supplemental"),
            weapons: game.i18n.localize("RT.ShipComponent.Type.Weapons"),
            auger: game.i18n.localize("RT.ShipComponent.Type.Auger"),
            gellarField: game.i18n.localize("RT.ShipComponent.Type.GellarField"),
            voidShields: game.i18n.localize("RT.ShipComponent.Type.VoidShields"),
            warpDrive: game.i18n.localize("RT.ShipComponent.Type.WarpDrive"),
            lifeSupport: game.i18n.localize("RT.ShipComponent.Type.LifeSupport"),
            quarters: game.i18n.localize("RT.ShipComponent.Type.Quarters"),
            bridge: game.i18n.localize("RT.ShipComponent.Type.Bridge"),
            generatorum: game.i18n.localize("RT.ShipComponent.Type.Generatorum"),
            plasmaDrive: game.i18n.localize("RT.ShipComponent.Type.PlasmaDrive"),
            augment: game.i18n.localize("RT.ShipComponent.Type.Augment"),
            archeotech: game.i18n.localize("RT.ShipComponent.Type.Archeotech"),
            xenotech: game.i18n.localize("RT.ShipComponent.Type.Xenotech")
        };
    }

    /**
     * Get hull type choices for multi-select.
     * @returns {object} Choices object
     */
    _getHullTypeChoices() {
        return {
            all: game.i18n.localize("RT.HullType.All"),
            transport: game.i18n.localize("RT.HullType.Transport"),
            raider: game.i18n.localize("RT.HullType.Raider"),
            frigate: game.i18n.localize("RT.HullType.Frigate"),
            "light-cruiser": game.i18n.localize("RT.HullType.LightCruiser"),
            cruiser: game.i18n.localize("RT.HullType.Cruiser"),
            battlecruiser: game.i18n.localize("RT.HullType.Battlecruiser"),
            "grand-cruiser": game.i18n.localize("RT.HullType.GrandCruiser")
        };
    }

    /**
     * Get availability choices for dropdown.
     * @returns {object} Choices object
     */
    _getAvailabilityChoices() {
        return {
            ubiquitous: game.i18n.localize("RT.Availability.Ubiquitous"),
            abundant: game.i18n.localize("RT.Availability.Abundant"),
            plentiful: game.i18n.localize("RT.Availability.Plentiful"),
            common: game.i18n.localize("RT.Availability.Common"),
            average: game.i18n.localize("RT.Availability.Average"),
            scarce: game.i18n.localize("RT.Availability.Scarce"),
            rare: game.i18n.localize("RT.Availability.Rare"),
            "very-rare": game.i18n.localize("RT.Availability.VeryRare"),
            "extremely-rare": game.i18n.localize("RT.Availability.ExtremelyRare"),
            "near-unique": game.i18n.localize("RT.Availability.NearUnique"),
            unique: game.i18n.localize("RT.Availability.Unique")
        };
    }

    /**
     * Get condition choices for dropdown.
     * @returns {object} Choices object
     */
    _getConditionChoices() {
        return {
            functional: game.i18n.localize("RT.ShipComponent.Condition.Functional"),
            damaged: game.i18n.localize("RT.ShipComponent.Condition.Damaged"),
            unpowered: game.i18n.localize("RT.ShipComponent.Condition.Unpowered"),
            destroyed: game.i18n.localize("RT.ShipComponent.Condition.Destroyed")
        };
    }
}
