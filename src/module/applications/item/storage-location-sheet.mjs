/**
 * @file StorageLocationSheet - ApplicationV2 sheet for storage location items
 */

import ContainerItemSheet from "./container-item-sheet.mjs";

/**
 * Sheet for storage location items (containers/bags/backpacks).
 */
export default class StorageLocationSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["storage-location"],
        position: {
            width: 550,
            height: 500
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-storage-location-sheet.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "contents", group: "primary", label: "Contents" },
        { tab: "description", group: "primary", label: "Description" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "contents"
    };
}
