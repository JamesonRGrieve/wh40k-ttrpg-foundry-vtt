/**
 * @file ConditionSheet - ApplicationV2 sheet for condition items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/**
 * Sheet for condition items (status effects).
 * Displays condition properties with nature-based color coding.
 */
const ConditionSheet = defineSimpleItemSheet({
    className: 'ConditionSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'condition'],
    template: 'systems/wh40k-rpg/templates/item/item-condition-sheet.hbs',
    width: 560,
    height: 640,
    tabs: [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ],
    defaultTab: 'details',
    extraContext: {
        natures: {
            beneficial: 'Beneficial',
            harmful: 'Harmful',
            neutral: 'Neutral',
        },
        appliesTo: {
            self: 'Self',
            target: 'Target',
            both: 'Both',
            area: 'Area',
        },
    },
});

export default ConditionSheet;
