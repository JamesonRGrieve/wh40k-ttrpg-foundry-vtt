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
        actions: {
            resetUses: GearSheet.#onResetUses,
            consumeUse: GearSheet.#onConsumeUse
        },
        position: {
            width: 600,
            height: 700
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
        { tab: "effects", group: "primary", label: "Effects" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "details"
    };

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Handle reset uses action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onResetUses(event, target) {
        await this.item.system.resetUses();
    }

    /**
     * Handle consume use action
     * @param {Event} event
     * @param {HTMLElement} target
     */
    static async #onConsumeUse(event, target) {
        await this.item.system.consume();
    }
}
