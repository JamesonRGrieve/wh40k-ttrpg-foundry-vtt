/**
 * @file NpcSheet - NPC actor sheet using ApplicationV2 with PARTS system
 */

import AcolyteSheet from "./acolyte-sheet.mjs";
import { HandlebarManager } from "../../handlebars/handlebars-manager.mjs";

/**
 * Actor sheet for NPC type actors.
 * Uses V2 PARTS system for modular template rendering.
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
            { navSelector: "nav.rt-navigation", contentSelector: "#tab-body", initial: "combat", group: "primary" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/actor/npc/header.hbs"
        },
        tabs: {
            template: "systems/rogue-trader/templates/actor/npc/tabs.hbs"
        },
        combat: {
            template: "systems/rogue-trader/templates/actor/npc/tab-combat.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        abilities: {
            template: "systems/rogue-trader/templates/actor/npc/tab-abilities.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        gear: {
            template: "systems/rogue-trader/templates/actor/npc/tab-gear.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        powers: {
            template: "systems/rogue-trader/templates/actor/npc/tab-powers.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        notes: {
            template: "systems/rogue-trader/templates/actor/npc/tab-notes.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "combat", label: "RT.Tabs.Combat", group: "primary", cssClass: "tab-combat" },
        { tab: "abilities", label: "RT.Tabs.Abilities", group: "primary", cssClass: "tab-abilities" },
        { tab: "gear", label: "RT.Tabs.Gear", group: "primary", cssClass: "tab-gear" },
        { tab: "powers", label: "RT.Tabs.Powers", group: "primary", cssClass: "tab-powers" },
        { tab: "notes", label: "RT.NPC.Notes", group: "primary", cssClass: "tab-notes" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "combat"
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

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        
        // Add tab metadata for tab parts
        if (["combat", "abilities", "gear", "powers", "notes"].includes(partId)) {
            const tabConfig = this.constructor.TABS.find(t => t.tab === partId);
            context.tab = {
                id: partId,
                group: tabConfig?.group || "primary",
                active: this.tabGroups.primary === partId,
                cssClass: tabConfig?.cssClass || ""
            };
        }
        
        return context;
    }
}
