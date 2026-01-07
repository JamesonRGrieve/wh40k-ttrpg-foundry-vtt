/**
 * @file CyberneticSheet - ApplicationV2 sheet for cybernetic items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for cybernetic/augmetic items.
 */
export default class CyberneticSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["cybernetic"],
        position: {
            width: 520,
            height: 480
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-cybernetic-sheet.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "details", group: "primary", label: "Details" },
        { tab: "description", group: "primary", label: "Description" },
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };
}
