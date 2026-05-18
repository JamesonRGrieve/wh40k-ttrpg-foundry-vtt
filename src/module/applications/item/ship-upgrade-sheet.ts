/**
 * @file ShipUpgradeSheet - ApplicationV2 sheet for ship upgrade items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Tab label localization keys, hoisted so the tab descriptors reference identifiers. */
const TAB_LABEL_DETAILS = 'WH40K.Tabs.Details';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

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
 * Sheet for ship upgrade items.
 * Handles ship history templates, quirks, and other vessel modifications.
 */
const ShipUpgradeSheet = defineSimpleItemSheet({
    className: 'ShipUpgradeSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'ship-upgrade'],
    template: 'systems/wh40k-rpg/templates/item/ship-upgrade-sheet.hbs',
    width: 600,
    height: 650,
    tabs: [
        { tab: 'details', group: 'primary', label: TAB_LABEL_DETAILS },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
    ],
    defaultTab: 'details',
    prepareContext(_sheet, context) {
        // Add upgrade-specific choices
        context['availabilities'] = getAvailabilityChoices();

        // Add display helpers
        const sys = context['system'] as { hasModifiers?: boolean; power?: number };
        context['hasModifiers'] = sys.hasModifiers;
        context['isPowerConsumer'] = (sys.power ?? 0) > 0;
        context['isPowerGenerator'] = (sys.power ?? 0) < 0;
    },
});

export default ShipUpgradeSheet;
