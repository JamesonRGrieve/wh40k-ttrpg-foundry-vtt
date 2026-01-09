/**
 * @file ShipWeaponSheet - ApplicationV2 sheet for ship weapon items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for ship weapon items.
 * Handles macrobatteries, lances, torpedoes, and other ship-scale weapons.
 */
export default class ShipWeaponSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["ship-weapon"],
        position: {
            width: 600,
            height: 700
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/ship-weapon-sheet.hbs",
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
        
        // Add weapon-specific choices
        context.weaponTypes = this._getWeaponTypeChoices();
        context.locations = this._getLocationChoices();
        context.hullTypes = this._getHullTypeChoices();
        context.availabilities = this._getAvailabilityChoices();
        
        // Add display helpers
        context.hasSpecialQualities = context.system.special?.size > 0;
        
        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get weapon type choices for dropdown.
     * @returns {object} Choices object
     */
    _getWeaponTypeChoices() {
        return {
            macrobattery: game.i18n.localize("RT.ShipWeapon.Type.Macrobattery"),
            lance: game.i18n.localize("RT.ShipWeapon.Type.Lance"),
            "nova-cannon": game.i18n.localize("RT.ShipWeapon.Type.NovaCannon"),
            torpedo: game.i18n.localize("RT.ShipWeapon.Type.Torpedo"),
            "bombardment-cannon": game.i18n.localize("RT.ShipWeapon.Type.BombardmentCannon"),
            "landing-bay": game.i18n.localize("RT.ShipWeapon.Type.LandingBay"),
            "attack-craft": game.i18n.localize("RT.ShipWeapon.Type.AttackCraft")
        };
    }

    /**
     * Get location choices for dropdown.
     * @returns {object} Choices object
     */
    _getLocationChoices() {
        return {
            prow: game.i18n.localize("RT.ShipLocation.Prow"),
            dorsal: game.i18n.localize("RT.ShipLocation.Dorsal"),
            port: game.i18n.localize("RT.ShipLocation.Port"),
            starboard: game.i18n.localize("RT.ShipLocation.Starboard"),
            keel: game.i18n.localize("RT.ShipLocation.Keel")
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
}
