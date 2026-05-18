/**
 * @file ShipWeaponSheet - ApplicationV2 sheet for ship weapon items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Tab label localization keys, hoisted so the tab descriptors reference identifiers. */
const TAB_LABEL_DETAILS = 'WH40K.Tabs.Details';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

/**
 * Get weapon type choices for dropdown.
 * @returns Choices object
 */
function getWeaponTypeChoices(): Record<string, string> {
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
 * @returns Choices object
 */
function getLocationChoices(): Record<string, string> {
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
 * @returns Choices object
 */
function getHullTypeChoices(): Record<string, string> {
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
 * @returns Choices object
 */
function getAvailabilityChoices(): Record<string, string> {
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

/**
 * Sheet for ship weapon items.
 * Handles macrobatteries, lances, torpedoes, and other ship-scale weapons.
 */
const ShipWeaponSheet = defineSimpleItemSheet({
    className: 'ShipWeaponSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'ship-weapon'],
    template: 'systems/wh40k-rpg/templates/item/ship-weapon-sheet.hbs',
    width: 600,
    height: 700,
    tabs: [
        { tab: 'details', group: 'primary', label: TAB_LABEL_DETAILS },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
    ],
    defaultTab: 'details',
    prepareContext(_sheet, context) {
        // Add weapon-specific choices
        context['weaponTypes'] = getWeaponTypeChoices();
        context['locations'] = getLocationChoices();
        context['hullTypes'] = getHullTypeChoices();
        context['availabilities'] = getAvailabilityChoices();

        // Add display helpers
        const system = context['system'] as { special?: { size?: number } } | undefined;
        context['hasSpecialQualities'] = (system?.special?.size ?? 0) > 0;
    },
});

export default ShipWeaponSheet;
