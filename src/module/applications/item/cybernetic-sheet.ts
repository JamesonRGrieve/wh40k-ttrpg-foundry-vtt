/**
 * @file CyberneticSheet - ApplicationV2 sheet for cybernetic items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for cybernetic/augmetic items. */
const CyberneticSheet = defineSimpleItemSheet({
    className: 'CyberneticSheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'cybernetic'],
    template: 'systems/wh40k-rpg/templates/item/item-cybernetic-sheet.hbs',
    width: 600,
    height: 700,
    tabs: [
        { tab: 'properties', group: 'primary', label: 'WH40K.Tabs.Properties' },
        { tab: 'installation', group: 'primary', label: 'WH40K.Tabs.Installation' },
        { tab: 'modifiers', group: 'primary', label: 'WH40K.Tabs.Modifiers' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Info' },
        { tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects' },
    ],
    defaultTab: 'properties',
});

export default CyberneticSheet;
