/**
 * @file TraitSheet - ApplicationV2 sheet for trait items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for trait items.
 */
export default class TraitSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["trait"],
        position: {
            width: 520,
            height: 420
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-trait-sheet-modern.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { id: "details", group: "primary", label: "Details" },
        { id: "description", group: "primary", label: "Description" },
        { id: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };
}
