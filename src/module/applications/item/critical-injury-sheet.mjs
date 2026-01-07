/**
 * @file CriticalInjurySheet - ApplicationV2 sheet for critical injury items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for critical injury items.
 */
export default class CriticalInjurySheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["critical-injury"],
        position: {
            width: 500,
            height: 400
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-critical-injury-sheet.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "details", group: "primary", label: "Details" },
        { tab: "description", group: "primary", label: "Description" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };
}
