/**
 * @file WeaponModSheet - ApplicationV2 sheet for weapon modification items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for weapon modification items.
 */
export default class WeaponModSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["wh40k-rpg", "sheet", "item", "weapon-mod"],
        position: {
            width: 500,
            height: 420
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/wh40k-rpg/templates/item/item-weapon-mod-sheet.hbs",
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
