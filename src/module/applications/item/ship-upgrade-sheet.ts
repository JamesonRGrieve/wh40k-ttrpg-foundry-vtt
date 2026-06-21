/**
 * @file ShipUpgradeSheet - ApplicationV2 sheet for ship upgrade items
 */

import { shipAvailabilityChoices } from '../../utils/ship-choices.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Tab label localization keys, hoisted so the tab descriptors reference identifiers. */
const TAB_LABEL_DETAILS = 'WH40K.Tabs.Details';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';

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
        context['availabilities'] = shipAvailabilityChoices();

        // Add display helpers
        const sys = context['system'] as { hasModifiers?: boolean; power?: number };
        context['hasModifiers'] = sys.hasModifiers;
        context['isPowerConsumer'] = (sys.power ?? 0) > 0;
        context['isPowerGenerator'] = (sys.power ?? 0) < 0;
    },
});

export default ShipUpgradeSheet;
