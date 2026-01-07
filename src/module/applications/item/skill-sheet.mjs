/**
 * @file SkillSheet - ApplicationV2 sheet for skill items (compendium skills)
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for skill items (used in compendiums).
 */
export default class SkillSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["skill"],
        position: {
            width: 520,
            height: 450
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-skill-sheet-modern.hbs",
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
