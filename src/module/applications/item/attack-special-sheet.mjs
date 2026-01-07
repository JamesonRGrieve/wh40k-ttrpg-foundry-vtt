/**
 * @file AttackSpecialSheet - ApplicationV2 sheet for attack special items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for attack special/quality items.
 */
export default class AttackSpecialSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["attack-special"],
        position: {
            width: 500,
            height: 400
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-attack-special-sheet.hbs",
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
