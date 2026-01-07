/**
 * @file StarshipSheet - Starship actor sheet using ApplicationV2
 */

import BaseActorSheet from "./base-actor-sheet.mjs";

/**
 * Actor sheet for Starship type actors.
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
            { navSelector: ".rt-navigation", contentSelector: ".rt-body", initial: "stats" }
        ]
    };

    /* -------------------------------------------- */

    /** @override */
    static PARTS = {
        sheet: {
            template: "systems/rogue-trader/templates/actor/actor-starship-sheet.hbs",
            scrollable: [".rt-body"]
        }
    };

    /* -------------------------------------------- */

    /** @override */
    static TABS = [];  // Tabs are handled by the template itself for now

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
