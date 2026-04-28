/**
 * @file WeaponQualitySheet - ApplicationV2 sheet for weapon quality items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for weapon quality items. */
const WeaponQualitySheet = defineSimpleItemSheet({
    className: 'WeaponQualitySheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'weapon-quality'],
    template: 'systems/wh40k-rpg/templates/item/item-weapon-quality-sheet.hbs',
    width: 550,
    height: 500,
    tabs: [
        { tab: 'effect', group: 'primary', label: 'Effect' },
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ],
    defaultTab: 'effect',
});

export default WeaponQualitySheet;
