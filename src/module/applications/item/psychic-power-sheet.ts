/**
 * @file PsychicPowerSheet - ApplicationV2 sheet for psychic power items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for psychic power items. */
const PsychicPowerSheet = defineSimpleItemSheet({
    className: 'PsychicPowerSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'psychic-power'],
    template: 'systems/wh40k-rpg/templates/item/item-psychic-power-sheet.hbs',
    width: 550,
    height: 500,
    tabs: [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
        { tab: 'effects', group: 'primary', label: 'Effects' },
    ],
    defaultTab: 'details',
});

export default PsychicPowerSheet;
