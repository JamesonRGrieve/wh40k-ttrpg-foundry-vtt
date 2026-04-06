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
        classes: ["wh40k-rpg", "sheet", "item", "ship-component"],
        position: {
            width: 600,
            height: 700
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/wh40k-rpg/templates/item/ship-component-sheet.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "details", group: "primary", label: "WH40K.Item.Tabs.Details" },
        { tab: "effects", group: "primary", label: "WH40K.Item.Tabs.Effects" }
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
            essential: game.i18n.localize("WH40K.ShipComponent.Type.Essential"),
            supplemental: game.i18n.localize("WH40K.ShipComponent.Type.Supplemental"),
            weapons: game.i18n.localize("WH40K.ShipComponent.Type.Weapons"),
            auger: game.i18n.localize("WH40K.ShipComponent.Type.Auger"),
            gellarField: game.i18n.localize("WH40K.ShipComponent.Type.GellarField"),
            voidShields: game.i18n.localize("WH40K.ShipComponent.Type.VoidShields"),
            warpDrive: game.i18n.localize("WH40K.ShipComponent.Type.WarpDrive"),
            lifeSupport: game.i18n.localize("WH40K.ShipComponent.Type.LifeSupport"),
            quarters: game.i18n.localize("WH40K.ShipComponent.Type.Quarters"),
            bridge: game.i18n.localize("WH40K.ShipComponent.Type.Bridge"),
            generatorum: game.i18n.localize("WH40K.ShipComponent.Type.Generatorum"),
            plasmaDrive: game.i18n.localize("WH40K.ShipComponent.Type.PlasmaDrive"),
            augment: game.i18n.localize("WH40K.ShipComponent.Type.Augment"),
            archeotech: game.i18n.localize("WH40K.ShipComponent.Type.Archeotech"),
            xenotech: game.i18n.localize("WH40K.ShipComponent.Type.Xenotech")
        };
    }

    /**
     * Get hull type choices for multi-select.
     * @returns {object} Choices object
     */
    _getHullTypeChoices() {
        return {
            all: game.i18n.localize("WH40K.HullType.All"),
            transport: game.i18n.localize("WH40K.HullType.Transport"),
            raider: game.i18n.localize("WH40K.HullType.Raider"),
            frigate: game.i18n.localize("WH40K.HullType.Frigate"),
            "light-cruiser": game.i18n.localize("WH40K.HullType.LightCruiser"),
            cruiser: game.i18n.localize("WH40K.HullType.Cruiser"),
            battlecruiser: game.i18n.localize("WH40K.HullType.Battlecruiser"),
            "grand-cruiser": game.i18n.localize("WH40K.HullType.GrandCruiser")
        };
    }

    /**
     * Get availability choices for dropdown.
     * @returns {object} Choices object
     */
    _getAvailabilityChoices() {
        return {
            ubiquitous: game.i18n.localize("WH40K.Availability.Ubiquitous"),
            abundant: game.i18n.localize("WH40K.Availability.Abundant"),
            plentiful: game.i18n.localize("WH40K.Availability.Plentiful"),
            common: game.i18n.localize("WH40K.Availability.Common"),
            average: game.i18n.localize("WH40K.Availability.Average"),
            scarce: game.i18n.localize("WH40K.Availability.Scarce"),
            rare: game.i18n.localize("WH40K.Availability.Rare"),
            "very-rare": game.i18n.localize("WH40K.Availability.VeryRare"),
            "extremely-rare": game.i18n.localize("WH40K.Availability.ExtremelyRare"),
            "near-unique": game.i18n.localize("WH40K.Availability.NearUnique"),
            unique: game.i18n.localize("WH40K.Availability.Unique")
        };
    }

    /**
     * Get condition choices for dropdown.
     * @returns {object} Choices object
     */
    _getConditionChoices() {
        return {
            functional: game.i18n.localize("WH40K.ShipComponent.Condition.Functional"),
            damaged: game.i18n.localize("WH40K.ShipComponent.Condition.Damaged"),
            unpowered: game.i18n.localize("WH40K.ShipComponent.Condition.Unpowered"),
            destroyed: game.i18n.localize("WH40K.ShipComponent.Condition.Destroyed")
        };
    }
}
