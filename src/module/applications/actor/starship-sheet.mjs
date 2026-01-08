/**
 * @file StarshipSheet - Starship actor sheet using ApplicationV2 with PARTS system
 */

import BaseActorSheet from "./base-actor-sheet.mjs";
import { HandlebarManager } from "../../handlebars/handlebars-manager.mjs";

/**
 * Actor sheet for Starship type actors.
 * Uses V2 PARTS system for modular template rendering.
 */
export default class StarshipSheet extends BaseActorSheet {
    /** @override */
    static DEFAULT_OPTIONS = {
        actions: {
            fireShipWeapon: StarshipSheet.#fireShipWeapon,
            rollInitiative: StarshipSheet.#rollInitiative
        },
        classes: ["starship"],
        position: {
            width: 900,
            height: 700
        },
        tabs: [
            { navSelector: "nav.rt-navigation", contentSelector: "#tab-body", initial: "stats", group: "primary" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        header: {
            template: "systems/rogue-trader/templates/actor/starship/header.hbs"
        },
        tabs: {
            template: "systems/rogue-trader/templates/actor/starship/tabs.hbs"
        },
        stats: {
            template: "systems/rogue-trader/templates/actor/starship/tab-stats.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        components: {
            template: "systems/rogue-trader/templates/actor/starship/tab-components.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        weapons: {
            template: "systems/rogue-trader/templates/actor/starship/tab-weapons.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        crew: {
            template: "systems/rogue-trader/templates/actor/starship/tab-crew.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        },
        history: {
            template: "systems/rogue-trader/templates/actor/starship/tab-history.hbs",
            container: { classes: ["rt-body"], id: "tab-body" },
            scrollable: [""]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [
        { tab: "stats", label: "RT.Starship.Tabs.Stats", group: "primary", cssClass: "tab-stats" },
        { tab: "components", label: "RT.Starship.Tabs.Components", group: "primary", cssClass: "tab-components" },
        { tab: "weapons", label: "RT.Starship.Tabs.Weapons", group: "primary", cssClass: "tab-weapons" },
        { tab: "crew", label: "RT.Starship.Tabs.Crew", group: "primary", cssClass: "tab-crew" },
        { tab: "history", label: "RT.Starship.Tabs.History", group: "primary", cssClass: "tab-history" }
    ];

    /* -------------------------------------------- */

    /** @override */
    tabGroups = {
        primary: "stats"
    };

    /* -------------------------------------------- */
    /*  Rendering                                   */
    /* -------------------------------------------- */

    /** @inheritDoc */
    async _prepareContext(options) {
        // Lazy load Starship-specific templates
        await HandlebarManager.loadActorSheetTemplates("starship");
        
        const context = await super._prepareContext(options);
        context.dh = CONFIG.rt;

        // Prepare ship-specific data
        this._prepareShipData(context);

        return context;
    }

    /* -------------------------------------------- */

    /**
     * Prepare starship-specific data for the template.
     * @param {object} context  The template render context.
     * @protected
     */
    _prepareShipData(context) {
        const items = this.actor.items;

        // Get ship components grouped by type
        context.shipComponents = items.filter(item => item.type === "shipComponent");
        context.shipWeapons = items.filter(item => item.type === "shipWeapon");
        context.shipUpgrades = items.filter(item => item.type === "shipUpgrade");
        context.shipRoles = items.filter(item => item.type === "shipRole");

        // Calculate power and space usage
        context.powerGenerated = 0;
        context.powerUsed = 0;
        context.spaceUsed = 0;

        for (const component of context.shipComponents) {
            const power = component.system.powerUsage || 0;
            if (power > 0) {
                context.powerGenerated += power;
            } else {
                context.powerUsed += Math.abs(power);
            }
            context.spaceUsed += component.system.spaceUsage || 0;
        }

        for (const weapon of context.shipWeapons) {
            context.powerUsed += weapon.system.powerUsage || 0;
            context.spaceUsed += weapon.system.spaceUsage || 0;
        }

        for (const upgrade of context.shipUpgrades) {
            const power = upgrade.system.powerUsage || 0;
            if (power > 0) {
                context.powerGenerated += power;
            } else {
                context.powerUsed += Math.abs(power);
            }
            context.spaceUsed += upgrade.system.spaceUsage || 0;
        }

        context.powerAvailable = context.powerGenerated - context.powerUsed;
        context.spaceAvailable = (this.actor.system.space?.total || 0) - context.spaceUsed;
    }

    /* -------------------------------------------- */

    /**
     * Prepare context for specific parts.
     * @inheritDoc
     */
    async _preparePartContext(partId, context, options) {
        context = await super._preparePartContext(partId, context, options);
        
        // Add tab metadata for tab parts
        if (["stats", "components", "weapons", "crew", "history"].includes(partId)) {
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

    /* -------------------------------------------- */
    /*  Event Handlers                              */
    /* -------------------------------------------- */

    /**
     * Handle firing a ship weapon.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #fireShipWeapon(event, target) {
        const itemId = target.closest("[data-item-id]")?.dataset.itemId;
        const weapon = this.actor.items.get(itemId);
        if (!weapon) return;

        const cardData = {
            actor: this.actor,
            weapon: weapon,
            crewRating: this.actor.system.crew?.crewRating || 30
        };

        const html = await renderTemplate(
            "systems/rogue-trader/templates/chat/ship-weapon-chat.hbs",
            cardData
        );

        ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor: this.actor }),
            content: html,
            type: CONST.CHAT_MESSAGE_STYLES.OTHER
        });
    }

    /* -------------------------------------------- */

    /**
     * Handle rolling starship initiative.
     * @this {StarshipSheet}
     * @param {Event} event         Triggering click event.
     * @param {HTMLElement} target  Button that was clicked.
     */
    static async #rollInitiative(event, target) {
        await this.actor.rollInitiative?.();
    }
}
