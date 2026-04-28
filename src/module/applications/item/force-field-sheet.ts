/**
 * @file ForceFieldSheet - ApplicationV2 sheet for force field items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for force field items. */
const ForceFieldSheet = defineSimpleItemSheet({
    className: 'ForceFieldSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'force-field'],
    template: 'systems/wh40k-rpg/templates/item/item-force-field-sheet.hbs',
    width: 540,
    height: 620,
    tabs: [
        { tab: 'stats', group: 'primary', label: 'Stats' },
        { tab: 'description', group: 'primary', label: 'Info' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ],
    defaultTab: 'stats',
});

export default ForceFieldSheet;
