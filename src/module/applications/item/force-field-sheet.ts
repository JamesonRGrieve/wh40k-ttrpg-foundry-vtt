/**
 * @file ForceFieldSheet - ApplicationV2 sheet for force field items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { FORCE_FIELD_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** Sheet for force field items. */
const ForceFieldSheet = defineSimpleItemSheet({
    className: 'ForceFieldSheet',
    schemaLayout: FORCE_FIELD_EXTRA_LAYOUT,
    classes: ['wh40k-rpg', 'sheet', 'item', 'force-field'],
    template: 'systems/wh40k-rpg/templates/item/item-force-field-sheet.hbs',
    width: 540,
    height: 620,
    tabs: [
        { tab: 'stats', group: 'primary', label: 'WH40K.Tabs.Stats' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Info' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects' },
    ],
    defaultTab: 'stats',
});

export default ForceFieldSheet;
