/**
 * @file TraitSheet - ApplicationV2 sheet for trait items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Tab label localization keys, hoisted so the tab descriptors reference identifiers. */
const TAB_LABEL_PROPERTIES = 'WH40K.Tabs.Properties';
const TAB_LABEL_EFFECTS = 'WH40K.Tabs.Effects';
const TAB_LABEL_DESCRIPTION = 'WH40K.Tabs.Description';

/** Sheet for trait items. */
const TraitSheet = defineSimpleItemSheet({
    className: 'TraitSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'trait'],
    template: 'systems/wh40k-rpg/templates/item/item-trait-sheet.hbs',
    width: 600,
    height: 720,
    tabs: [
        { tab: 'properties', group: 'primary', label: TAB_LABEL_PROPERTIES },
        { tab: 'effects', group: 'primary', label: TAB_LABEL_EFFECTS },
        { tab: 'description', group: 'primary', label: TAB_LABEL_DESCRIPTION },
    ],
    defaultTab: 'properties',
});

export default TraitSheet;
