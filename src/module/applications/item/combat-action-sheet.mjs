/**
 * @file CombatActionSheet - ApplicationV2 sheet for combat action items
 */

import BaseItemSheet from "./base-item-sheet.mjs";

/**
 * Sheet for combat action items.
 */
export default class CombatActionSheet extends BaseItemSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["combat-action"],
        position: {
            width: 550,
            height: 620
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/item/item-combat-action-sheet.hbs",
            scrollable: [".rt-item-body"]
        }
    };
}
