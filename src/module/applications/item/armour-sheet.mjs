/**
 * @file ArmourSheet - ApplicationV2 sheet for armour items
 */

import ContainerItemSheet from "./container-item-sheet.mjs";

/**
 * Sheet for armour items with support for armour modifications.
 */
export default class ArmourSheet extends ContainerItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["armour"],
        position: {
            width: 520,
            height: 480
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-armour-sheet-modern.hbs",
            scrollable: [".rt-tab-content"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { id: "protection", group: "primary", label: "Protection" },
        { id: "description", group: "primary", label: "Description" },
        { id: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "protection"
    };
}
