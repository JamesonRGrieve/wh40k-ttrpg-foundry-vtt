/**
 * @file ShipWeaponSheet - ApplicationV2 sheet for ship weapon items
 */

import { shipAvailabilityChoices, shipHullTypeChoices } from '../../utils/ship-choices.ts';
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
        context['hullTypes'] = shipHullTypeChoices();
        context['availabilities'] = shipAvailabilityChoices();

        // Add display helpers
        const system = context['system'] as { special?: { size?: number } } | undefined;
        context['hasSpecialQualities'] = (system?.special?.size ?? 0) > 0;
    },
});

export default ShipWeaponSheet;
