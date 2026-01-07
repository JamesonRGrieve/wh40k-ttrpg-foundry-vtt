/**
 * @file GearSheet - ApplicationV2 sheet for gear/consumable/drug/tool items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for gear items (consumables, drugs, tools, etc.).
 */
export default class GearSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["gear"],
        position: {
            width: 520,
            height: 450
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-gear-sheet-modern.hbs",
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
