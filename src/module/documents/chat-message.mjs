/**
 * Extended ChatMessage class for Rogue Trader VTT
 * Provides custom rendering, interactive action buttons, and DoS/DoF display
 * @extends ChatMessage
 */
export class ChatMessageRT extends ChatMessage {

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the actor associated with this message's speaker
     * @type {Actor|null}
     */
    get speakerActor() {
        return ChatMessage.getSpeakerActor(this.speaker);
    }

    /**
     * Check if this message is an item card
     * @type {boolean}
     */
    get isItemCard() {
        return !!this.getFlag("rogue-trader", "itemCard");
    }

    /**
     * Check if this message is a roll with a target
     * @type {boolean}
     */
    get isTargetedRoll() {
        return this.isRoll && this.getFlag("rogue-trader", "target") !== undefined;
    }

    /**
     * Get the item UUID if this is an item card
     * @type {string|null}
     */
    get itemUuid() {
        return this.getFlag("rogue-trader", "item.uuid") ?? null;
    }

    /* -------------------------------------------- */
    /*  Roll Result Helpers                         */
    /* -------------------------------------------- */

    /**
     * Calculate degrees of success or failure for a d100 roll
     * @returns {{success: boolean, degrees: number}|null}
     */
    calculateDegrees() {
        if (!this.isRoll || !this.rolls?.length) return null;

        const roll = this.rolls[0];
        const target = this.getFlag("rogue-trader", "target");

        if (target === undefined || target === null) return null;

        // Check if this is a d100 roll
        const total = roll.total;
        const success = total <= target;
        const degrees = Math.floor(Math.abs(total - target) / 10);

        return { success, degrees };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll damage from an item card
     * @returns {Promise<void>}
     */
    async rollDamage() {
        const itemUuid = this.itemUuid;
        if (!itemUuid) {
            ui.notifications.warn("RT.Chat.NoItemFound", { localize: true });
            return;
        }

        const item = await fromUuid(itemUuid);
        if (!item) {
            ui.notifications.warn("RT.Chat.ItemNotFound", { localize: true });
            return;
        }

        // Check if item has a rollDamage method
        if (typeof item.rollDamage === "function") {
            await item.rollDamage();
        } else if (item.type === "weapon") {
            // Fallback for weapons without rollDamage method
            const actor = item.actor;
            if (actor?.rollWeaponDamage) {
                await actor.rollWeaponDamage(item);
            }
        }
    }

    /**
     * Apply damage to selected/targeted tokens
     * @param {number} damage - The damage to apply
     * @param {Object} options - Options for damage application
     * @param {string} [options.damageType] - Type of damage
     * @param {number} [options.penetration] - Penetration value
     * @param {string} [options.location] - Hit location
     * @returns {Promise<void>}
     */
    async applyDamage(damage, options = {}) {
        const targets = game.user.targets;

        if (targets.size === 0) {
            ui.notifications.warn("RT.Chat.NoTokensTargeted", { localize: true });
            return;
        }

        for (const token of targets) {
            const actor = token.actor;
            if (!actor) continue;

            if (typeof actor.applyDamage === "function") {
                await actor.applyDamage(damage, options);
            } else {
                // Fallback: directly modify wounds
                const currentWounds = actor.system.wounds?.value ?? 0;
                const newWounds = Math.max(0, currentWounds - damage);
                await actor.update({ "system.wounds.value": newWounds });
            }
        }
    }

    /**
     * Use an item from its card
     * @returns {Promise<void>}
     */
    async useItem() {
        const itemUuid = this.itemUuid;
        if (!itemUuid) {
            ui.notifications.warn("RT.Chat.NoItemFound", { localize: true });
            return;
        }

        const item = await fromUuid(itemUuid);
        if (!item) {
            ui.notifications.warn("RT.Chat.ItemNotFound", { localize: true });
            return;
        }

        // Use the item if it has a use method
        if (typeof item.use === "function") {
            await item.use();
        } else if (typeof item.roll === "function") {
            await item.roll();
        }
    }

    /* -------------------------------------------- */
    /*  Static Methods                              */
    /* -------------------------------------------- */

    /**
     * Handle click events on chat message action buttons
     * Called from the renderChatMessageHTML hook
     * @param {Event} event - The click event
     * @param {HTMLElement} html - The message HTML element
     */
    static async onChatCardAction(event, html) {
        event.preventDefault();
        const button = event.currentTarget;
        const action = button.dataset.action;
        
        // Get the message from the card
        const card = button.closest(".chat-message");
        if (!card) return;
        
        const messageId = card.dataset.messageId;
        const message = game.messages.get(messageId);

        if (!message) {
            console.warn("RT | ChatMessage not found for action:", action);
            return;
        }

        // Route to appropriate handler
        switch (action) {
            case "rollDamage":
            case "damage":
                return message.rollDamage();

            case "applyDamage": {
                const damage = parseInt(button.dataset.damage) || 0;
                const options = {
                    damageType: button.dataset.damageType,
                    penetration: parseInt(button.dataset.penetration) || 0,
                    location: button.dataset.location
                };
                return message.applyDamage(damage, options);
            }

            case "useItem":
            case "use":
                return message.useItem();

            case "attack": {
                const itemUuid = button.dataset.itemUuid || message.itemUuid;
                if (itemUuid) {
                    const item = await fromUuid(itemUuid);
                    if (item?.actor) {
                        // Import and use targeted action manager
                        const { DHTargetedActionManager } = await import("../actions/targeted-action-manager.mjs");
                        await DHTargetedActionManager.performWeaponAttack(item.actor, null, item);
                    }
                }
                return;
            }

            case "roll": {
                const itemUuid = button.dataset.itemUuid || message.itemUuid;
                if (itemUuid) {
                    const item = await fromUuid(itemUuid);
                    if (item && typeof item.roll === "function") {
                        await item.roll();
                    }
                }
                return;
            }

            default:
                game.rt.log(`Unknown chat action: ${action}`);
        }
    }

    /**
     * Enrich a degree badge into roll result HTML
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageRT} message - The chat message
     */
    static enrichDegreeBadge(html, message) {
        const result = message.calculateDegrees();
        if (!result) return;

        const { success, degrees } = result;

        // Find the dice total element
        const diceTotal = html.querySelector(".dice-total");
        if (!diceTotal) return;

        // Check if badge already exists
        if (diceTotal.querySelector(".rt-degree-badge")) return;

        // Create degree badge
        const badge = document.createElement("span");
        badge.className = `rt-degree-badge ${success ? "rt-degree-badge--success" : "rt-degree-badge--failure"}`;
        badge.textContent = `${degrees} ${success ? "DoS" : "DoF"}`;
        
        diceTotal.appendChild(badge);
    }

    /**
     * Add speaker portrait to message if missing
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageRT} message - The chat message
     */
    static enrichSpeakerPortrait(html, message) {
        const actor = message.speakerActor;
        if (!actor) return;

        const sender = html.querySelector(".message-sender");
        if (!sender) return;

        // Check if portrait already exists
        if (sender.querySelector(".rt-message-portrait")) return;

        const portrait = document.createElement("img");
        portrait.className = "rt-message-portrait";
        portrait.src = actor.img;
        portrait.alt = actor.name;
        
        sender.prepend(portrait);
    }

    /**
     * Add message ID to action buttons that need it
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageRT} message - The chat message
     */
    static enrichActionButtons(html, message) {
        html.querySelectorAll("[data-action]").forEach(btn => {
            // Add message ID if not present
            if (!btn.dataset.messageId) {
                btn.dataset.messageId = message.id;
            }
        });
    }
}

/* -------------------------------------------- */
/*  Hooks Registration                          */
/* -------------------------------------------- */

/**
 * Register chat message event listeners
 * This integrates with the existing renderChatMessageHTML hook pattern
 */
Hooks.on("renderChatMessageHTML", (message, html, context) => {
    // Enrich the message HTML
    ChatMessageRT.enrichDegreeBadge(html, message);
    ChatMessageRT.enrichSpeakerPortrait(html, message);
    ChatMessageRT.enrichActionButtons(html, message);

    // Add click listeners for RT-specific actions
    // Note: Existing roll-control__* listeners are handled by BasicActionManager
    html.querySelectorAll("[data-action]:not(.roll-control__hide-control):not(.roll-control__refund):not(.roll-control__fate-reroll):not(.roll-control__assign-damage):not(.roll-control__apply-damage)").forEach(btn => {
        btn.addEventListener("click", async (event) => {
            await ChatMessageRT.onChatCardAction(event, html);
        });
    });
});
