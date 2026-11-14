/**
 * @file WeaponModSheet - ApplicationV2 sheet for weapon modification items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { WEAPON_MODIFICATION_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** Sheet for weapon modification items. */
const WeaponModSheet = defineSimpleItemSheet({
    className: 'WeaponModSheet',
    schemaLayout: WEAPON_MODIFICATION_EXTRA_LAYOUT,
    classes: ['wh40k-rpg', 'sheet', 'item', 'weapon-mod'],
    template: 'systems/wh40k-rpg/templates/item/item-weapon-mod-sheet.hbs',
    width: 500,
    height: 420,
    tabs: [
        { tab: 'details', group: 'primary', label: 'WH40K.Tabs.Details' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description' },
    ],
    defaultTab: 'details',
});

export default WeaponModSheet;
