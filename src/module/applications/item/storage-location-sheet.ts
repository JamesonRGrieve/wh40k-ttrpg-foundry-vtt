/**
 * @file StorageLocationSheet - ApplicationV2 sheet for storage location items
 */

import ContainerItemSheet from './container-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { STORAGE_LOCATION_EXTRA_LAYOUT } from './schema-sheet-layouts.ts';

/** Sheet for storage location items (containers/bags/backpacks). */
const StorageLocationSheet = defineSimpleItemSheet({
    className: 'StorageLocationSheet',
    schemaLayout: STORAGE_LOCATION_EXTRA_LAYOUT,
    baseClass: ContainerItemSheet,
    classes: ['wh40k-rpg', 'storage-location'],
    template: 'systems/wh40k-rpg/templates/item/item-storage-location-sheet.hbs',
    width: 550,
    height: 500,
    // The template's strip and panels name the contents tab `items` (#638).
    tabs: [
        { tab: 'items', group: 'primary', label: 'WH40K.Tabs.Contents' },
        { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description' },
    ],
    defaultTab: 'items',
});

export default StorageLocationSheet;
