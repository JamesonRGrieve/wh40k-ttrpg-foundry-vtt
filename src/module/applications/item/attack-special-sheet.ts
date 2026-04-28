/**
 * @file AttackSpecialSheet - ApplicationV2 sheet for attack special items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for attack special/quality items. */
const AttackSpecialSheet = defineSimpleItemSheet({
    className: 'AttackSpecialSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'attack-special'],
    template: 'systems/wh40k-rpg/templates/item/item-attack-special-sheet.hbs',
    width: 500,
    height: 400,
    tabs: [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ],
    defaultTab: 'details',
});

export default AttackSpecialSheet;
