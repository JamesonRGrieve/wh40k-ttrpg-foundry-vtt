/**
 * @file PeerEnemySheet - ApplicationV2 sheet for peer/enemy items
 */

import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { PEER_ENEMY_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** Sheet for peer and enemy items. */
const PeerEnemySheet = defineSimpleItemSheet({
    className: 'PeerEnemySheet',
    schemaLayout: PEER_ENEMY_EXTRA_LAYOUT,
    classes: ['wh40k-rpg', 'sheet', 'item', 'peer-enemy'],
    template: 'systems/wh40k-rpg/templates/item/item-peer-enemy-sheet.hbs',
    width: 500,
    height: 380,
    tabs: [
        { tab: 'details', group: 'primary', label: 'WH40K.Tabs.Details' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description' },
    ],
    defaultTab: 'details',
});

export default PeerEnemySheet;
