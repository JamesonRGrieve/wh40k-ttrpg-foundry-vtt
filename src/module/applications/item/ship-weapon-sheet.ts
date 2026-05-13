/**
 * @file ShipWeaponSheet - ApplicationV2 sheet for ship weapon items
 */

import BaseItemSheet from './base-item-sheet.ts';

/**
 * Sheet for ship weapon items.
 * Handles macrobatteries, lances, torpedoes, and other ship-scale weapons.
 */
// @ts-expect-error - TS2417 static side inheritance
export default class ShipWeaponSheet extends BaseItemSheet {
    /** @override */
    static override DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'sheet', 'item', 'ship-weapon'],
        position: {
            width: 600,
            height: 700,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/ship-weapon-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static override TABS = [
        { tab: 'details', group: 'primary', label: 'WH40K.Item.Tabs.Details' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Item.Tabs.Effects' },
    ];

    /* -------------------------------------------- */

    /** @override */
    override tabGroups = {
        primary: 'details',
    };

    /* -------------------------------------------- */

    /** @override */
    override async _prepareContext(options: Record<string, unknown>): Promise<Record<string, unknown>> {
        const context = await super._prepareContext(options);

        // Add weapon-specific choices
        context['weaponTypes'] = this._getWeaponTypeChoices();
        context['locations'] = this._getLocationChoices();
        context['hullTypes'] = this._getHullTypeChoices();
        context['availabilities'] = this._getAvailabilityChoices();

        // Add display helpers
        // eslint-disable-next-line no-restricted-syntax -- boundary: system is untyped Record at context level
        context['hasSpecialQualities'] = (context['system'] as Record<string, unknown>)['special'] !== undefined;

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Get weapon type choices for dropdown.
     * @returns {object} Choices object
     */
    _getWeaponTypeChoices(): Record<string, string> {
        return {
            'macrobattery': game.i18n.localize('WH40K.ShipWeapon.Type.Macrobattery'),
            'lance': game.i18n.localize('WH40K.ShipWeapon.Type.Lance'),
            'nova-cannon': game.i18n.localize('WH40K.ShipWeapon.Type.NovaCannon'),
            'torpedo': game.i18n.localize('WH40K.ShipWeapon.Type.Torpedo'),
            'bombardment-cannon': game.i18n.localize('WH40K.ShipWeapon.Type.BombardmentCannon'),
            'landing-bay': game.i18n.localize('WH40K.ShipWeapon.Type.LandingBay'),
            'attack-craft': game.i18n.localize('WH40K.ShipWeapon.Type.AttackCraft'),
        };
    }

    /**
     * Get location choices for dropdown.
     * @returns {object} Choices object
     */
    _getLocationChoices(): Record<string, string> {
        return {
            prow: game.i18n.localize('WH40K.ShipLocation.Prow'),
            dorsal: game.i18n.localize('WH40K.ShipLocation.Dorsal'),
            port: game.i18n.localize('WH40K.ShipLocation.Port'),
            starboard: game.i18n.localize('WH40K.ShipLocation.Starboard'),
            keel: game.i18n.localize('WH40K.ShipLocation.Keel'),
        };
    }

    /**
     * Get hull type choices for multi-select.
     * @returns {object} Choices object
     */
    _getHullTypeChoices(): Record<string, string> {
        return {
            'all': game.i18n.localize('WH40K.HullType.All'),
            'transport': game.i18n.localize('WH40K.HullType.Transport'),
            'raider': game.i18n.localize('WH40K.HullType.Raider'),
            'frigate': game.i18n.localize('WH40K.HullType.Frigate'),
            'light-cruiser': game.i18n.localize('WH40K.HullType.LightCruiser'),
            'cruiser': game.i18n.localize('WH40K.HullType.Cruiser'),
            'battlecruiser': game.i18n.localize('WH40K.HullType.Battlecruiser'),
            'grand-cruiser': game.i18n.localize('WH40K.HullType.GrandCruiser'),
        };
    }

    /**
     * Get availability choices for dropdown.
     * @returns {object} Choices object
     */
    _getAvailabilityChoices(): Record<string, string> {
        return {
            'ubiquitous': game.i18n.localize('WH40K.Availability.Ubiquitous'),
            'abundant': game.i18n.localize('WH40K.Availability.Abundant'),
            'plentiful': game.i18n.localize('WH40K.Availability.Plentiful'),
            'common': game.i18n.localize('WH40K.Availability.Common'),
            'average': game.i18n.localize('WH40K.Availability.Average'),
            'scarce': game.i18n.localize('WH40K.Availability.Scarce'),
            'rare': game.i18n.localize('WH40K.Availability.Rare'),
            'very-rare': game.i18n.localize('WH40K.Availability.VeryRare'),
            'extremely-rare': game.i18n.localize('WH40K.Availability.ExtremelyRare'),
            'near-unique': game.i18n.localize('WH40K.Availability.NearUnique'),
            'unique': game.i18n.localize('WH40K.Availability.Unique'),
        };
    }
}
