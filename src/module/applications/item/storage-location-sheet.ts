/**
 * @file StorageLocationSheet - ApplicationV2 sheet for storage location items
 */

import ContainerItemSheet from './container-item-sheet.ts';

/**
 * Sheet for storage location items (containers/bags/backpacks).
 */
// @ts-expect-error - TS2417 static side inheritance
export default class StorageLocationSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ['wh40k-rpg', 'storage-location'],
        position: {
            width: 550,
            height: 500,
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: 'systems/wh40k-rpg/templates/item/item-storage-location-sheet.hbs',
            scrollable: ['.wh40k-tab-content'],
        },
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: 'contents', group: 'primary', label: 'Contents' },
        { tab: 'description', group: 'primary', label: 'Description' },
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: 'contents',
    };
}
