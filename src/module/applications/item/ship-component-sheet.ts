/**
 * @file ShipComponentSheet - ApplicationV2 sheet for ship component items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Tab label localization keys, hoisted so the tab descriptors reference identifiers. */
const TAB_LABEL_DETAILS = 'WH40K.Tabs.Details';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

/**
 * Get component type choices for dropdown.
 * @returns Choices object
 */
function getComponentTypeChoices(): Record<string, string> {
    return {
        essential: game.i18n.localize('WH40K.ShipComponent.Type.Essential'),
        supplemental: game.i18n.localize('WH40K.ShipComponent.Type.Supplemental'),
        weapons: game.i18n.localize('WH40K.ShipComponent.Type.Weapons'),
        auger: game.i18n.localize('WH40K.ShipComponent.Type.Auger'),
        gellarField: game.i18n.localize('WH40K.ShipComponent.Type.GellarField'),
        voidShields: game.i18n.localize('WH40K.ShipComponent.Type.VoidShields'),
        warpDrive: game.i18n.localize('WH40K.ShipComponent.Type.WarpDrive'),
        lifeSupport: game.i18n.localize('WH40K.ShipComponent.Type.LifeSupport'),
        quarters: game.i18n.localize('WH40K.ShipComponent.Type.Quarters'),
        bridge: game.i18n.localize('WH40K.ShipComponent.Type.Bridge'),
        generatorum: game.i18n.localize('WH40K.ShipComponent.Type.Generatorum'),
        plasmaDrive: game.i18n.localize('WH40K.ShipComponent.Type.PlasmaDrive'),
        augment: game.i18n.localize('WH40K.ShipComponent.Type.Augment'),
        archeotech: game.i18n.localize('WH40K.ShipComponent.Type.Archeotech'),
        xenotech: game.i18n.localize('WH40K.ShipComponent.Type.Xenotech'),
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
 * Get condition choices for dropdown.
 * @returns Choices object
 */
function getConditionChoices(): Record<string, string> {
    return {
        functional: game.i18n.localize('WH40K.ShipComponent.Condition.Functional'),
        damaged: game.i18n.localize('WH40K.ShipComponent.Condition.Damaged'),
        unpowered: game.i18n.localize('WH40K.ShipComponent.Condition.Unpowered'),
        destroyed: game.i18n.localize('WH40K.ShipComponent.Condition.Destroyed'),
    };
}

/**
 * Sheet for ship component items.
 * Handles essential components, supplemental systems, bridges, drives, etc.
 */
const ShipComponentSheet = defineSimpleItemSheet({
    className: 'ShipComponentSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'ship-component'],
    template: 'systems/wh40k-rpg/templates/item/ship-component-sheet.hbs',
    width: 600,
    height: 700,
    tabs: [
        { tab: 'details', group: 'primary', label: TAB_LABEL_DETAILS },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
    ],
    defaultTab: 'details',
    prepareContext(_sheet, context) {
        // Add component-specific choices
        context['componentTypes'] = getComponentTypeChoices();
        context['hullTypes'] = getHullTypeChoices();
        context['availabilities'] = getAvailabilityChoices();
        context['conditions'] = getConditionChoices();

        // Add display helpers
        const sys = context['system'] as { hasModifiers?: boolean; power?: { generated?: number; used?: number } };
        context['isGenerator'] = (sys.power?.generated ?? 0) > 0;
        context['isPowerConsumer'] = (sys.power?.used ?? 0) > 0;
        context['hasModifiers'] = sys.hasModifiers;
    },
});

export default ShipComponentSheet;
