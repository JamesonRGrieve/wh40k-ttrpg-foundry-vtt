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
    // The tabs the template's strip renders (#638): a default naming a tab the template lacks hid every panel.
    tabs: [
        { tab: 'power', group: 'primary', label: 'WH40K.ItemSheet.PsychicPower.PowerTab' },
        { tab: 'damage', group: 'primary', label: 'WH40K.Weapon.Damage' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects' },
    ],
    defaultTab: 'power',
});

export default PsychicPowerSheet;
