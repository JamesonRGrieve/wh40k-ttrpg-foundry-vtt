/**
 * @file NpcSheet - NPC actor sheet using ApplicationV2
 */

import AcolyteSheet from "./acolyte-sheet.mjs";
import { HandlebarManager } from "../../handlebars/handlebars-manager.mjs";

/**
 * Actor sheet for NPC type actors.
 * Extends AcolyteSheet with minimal overrides since NPCs use similar functionality.
 */
export default class NpcSheet extends AcolyteSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        classes: ["npc"],
        position: {
            width: 1000,
            height: 750
        },
        tabs: [
            { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "main" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/actor/actor-npc-sheet.hbs",
            scrollable: [".rt-body"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [];  // Tabs are handled by the template itself for now

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "main"
    };

    /* -------------------------------------------- */

    /**
     * Lazy load NPC templates before first render.
     * @inheritDoc
     */
    async _prepareContext(options) {
        // Lazy load NPC-specific templates
        await HandlebarManager.loadActorSheetTemplates("npc");
        return super._prepareContext(options);
    }
}
