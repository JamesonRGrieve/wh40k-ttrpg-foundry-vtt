/**
 * @file AmmoSheet - ApplicationV2 sheet for ammunition items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for ammunition items.
 */
export default class AmmoSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["ammunition"],
        position: {
            width: 520,
            height: 400
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-ammo-sheet.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { id: "details", group: "primary", label: "Details" },
        { id: "description", group: "primary", label: "Description" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };
}
