/**
 * @file PeerEnemySheet - ApplicationV2 sheet for peer/enemy items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for peer and enemy items. */
const PeerEnemySheet = defineSimpleItemSheet({
    className: 'PeerEnemySheet',
    classes: ['wh40k-rpg', 'sheet', 'item', 'peer-enemy'],
    template: 'systems/wh40k-rpg/templates/item/item-peer-enemy-sheet.hbs',
    width: 500,
    height: 380,
    tabs: [
        { tab: 'details', group: 'primary', label: 'Details' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ],
    defaultTab: 'details',
});

export default PeerEnemySheet;
