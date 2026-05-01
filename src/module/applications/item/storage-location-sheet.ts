/**
 * @file StorageLocationSheet - ApplicationV2 sheet for storage location items
 */

import ContainerItemSheet from './container-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';

/** Sheet for storage location items (containers/bags/backpacks). */
const StorageLocationSheet = defineSimpleItemSheet({
    className: 'StorageLocationSheet',
    baseClass: ContainerItemSheet as typeof ContainerItemSheet & typeof import('./base-item-sheet.ts').default,
    classes: ['wh40k-rpg', 'storage-location'],
    template: 'systems/wh40k-rpg/templates/item/item-storage-location-sheet.hbs',
    width: 550,
    height: 500,
    tabs: [
        { tab: 'contents', group: 'primary', label: 'Contents' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ],
    defaultTab: 'contents',
});

export default StorageLocationSheet;
