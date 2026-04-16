/**
 * Extended ChatMessage class for WH40K RPG VTT
 * Provides custom rendering, interactive action buttons, and DoS/DoF display
 * @extends ChatMessage
 */
export class ChatMessageWH40K extends ChatMessage {
    [key: string]: any;
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
        // @ts-expect-error - argument type
        return !!this.getFlag('wh40k-rpg', 'itemCard');
    }

    /**
     * Check if this message is a roll with a target
     * @type {boolean}
     */
    get isTargetedRoll() {
        // @ts-expect-error - argument type
        return this.isRoll && this.getFlag('wh40k-rpg', 'target') !== undefined;
    }

    /**
     * Get the item UUID if this is an item card
     * @type {string|null}
     */
    get itemUuid() {
        // @ts-expect-error - argument type
        return this.getFlag('wh40k-rpg', 'item.uuid') ?? null;
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
        // @ts-expect-error - argument type
        const target = this.getFlag('wh40k-rpg', 'target');

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
            (ui.notifications as any).warn('WH40K.Chat.NoItemFound', { localize: true });
            return;
        }

        const item = await fromUuid(itemUuid);
        if (!item) {
            (ui.notifications as any).warn('WH40K.Chat.ItemNotFound', { localize: true });
            return;
        }

        // Check if item has a rollDamage method
        // @ts-expect-error - dynamic property access
        if (typeof item.rollDamage === 'function') {
            // @ts-expect-error - dynamic property access
            await item.rollDamage();
            // @ts-expect-error - dynamic property access
        } else if (item.type === 'weapon') {
            // Fallback for weapons without rollDamage method
            // @ts-expect-error - dynamic property access
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
            (ui.notifications as any).warn('WH40K.Chat.NoTokensTargeted', { localize: true });
            return;
        }

        for (const token of targets) {
            const actor = token.actor;
            if (!actor) continue;

            // @ts-expect-error - TS2339
            if (typeof actor.applyDamage === 'function') {
                // @ts-expect-error - TS2339
                await actor.applyDamage(damage, options);
            } else {
                // Fallback: directly modify wounds
                // @ts-expect-error - system data access
                const currentWounds = actor.system.wounds?.value ?? 0;
                const newWounds = Math.max(0, currentWounds - damage);
                // @ts-expect-error - extended property
                await actor.update({ 'system.wounds.value': newWounds });
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
            (ui.notifications as any).warn('WH40K.Chat.NoItemFound', { localize: true });
            return;
        }

        const item = await fromUuid(itemUuid);
        if (!item) {
            (ui.notifications as any).warn('WH40K.Chat.ItemNotFound', { localize: true });
            return;
        }

        // Use the item if it has a use method
        // @ts-expect-error - dynamic property access
        if (typeof item.use === 'function') {
            // @ts-expect-error - dynamic property access
            await item.use();
            // @ts-expect-error - dynamic property access
        } else if (typeof item.roll === 'function') {
            // @ts-expect-error - dynamic property access
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
        const card = button.closest('.chat-message');
        if (!card) return;

        const messageId = card.dataset.messageId;
        // @ts-expect-error - dynamic property access
        const message = game.messages.get(messageId);

        if (!message) {
            console.warn('WH40K | ChatMessage not found for action:', action);
            return;
        }

        // Route to appropriate handler
        switch (action) {
            case 'rollDamage':
            case 'damage':
                return message.rollDamage();

            case 'applyDamage': {
                const damage = parseInt(button.dataset.damage) || 0;
                const options = {
                    damageType: button.dataset.damageType,
                    penetration: parseInt(button.dataset.penetration) || 0,
                    location: button.dataset.location,
                };
                return message.applyDamage(damage, options);
            }

            case 'useItem':
            case 'use':
                return message.useItem();

            case 'attack': {
                const itemUuid = button.dataset.itemUuid || message.itemUuid;
                if (itemUuid) {
                    const item = await fromUuid(itemUuid);
                    if (item?.actor) {
                        // Import and use targeted action manager
                        const { DHTargetedActionManager } = await import('../actions/targeted-action-manager.ts');
                        await DHTargetedActionManager.performWeaponAttack(item.actor, null, item);
                    }
                }
                return;
            }

            case 'roll': {
                const itemUuid = button.dataset.itemUuid || message.itemUuid;
                if (itemUuid) {
                    const item = await fromUuid(itemUuid);
                    if (item && typeof item.roll === 'function') {
                        await item.roll();
                    }
                }
                return;
            }

            default:
                game.wh40k.log(`Unknown chat action: ${action}`);
        }
    }

    /**
     * Enrich a degree badge into roll result HTML
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichDegreeBadge(html, message) {
        const result = message.calculateDegrees();
        if (!result) return;

        const { success, degrees } = result;

        // Find the dice total element
        const diceTotal = html.querySelector('.dice-total');
        if (!diceTotal) return;

        // Check if badge already exists
        if (diceTotal.querySelector('.wh40k-degree-badge')) return;

        // Create degree badge
        const badge = document.createElement('span');
        badge.className = `wh40k-degree-badge ${success ? 'wh40k-degree-badge--success' : 'wh40k-degree-badge--failure'}`;
        badge.textContent = `${degrees} ${success ? 'DoS' : 'DoF'}`;

        diceTotal.appendChild(badge);
    }

    /**
     * Add speaker portrait to message if missing
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichSpeakerPortrait(html, message) {
        const actor = message.speakerActor;
        if (!actor) return;

        const sender = html.querySelector('.message-sender');
        if (!sender) return;

        // Check if portrait already exists
        if (sender.querySelector('.wh40k-message-portrait')) return;

        const portrait = document.createElement('img');
        portrait.className = 'wh40k-message-portrait';
        portrait.src = actor.img;
        portrait.alt = actor.name;

        sender.prepend(portrait);
    }

    /**
     * Add message ID to action buttons that need it
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichActionButtons(html, message) {
        html.querySelectorAll('[data-action]').forEach((btn) => {
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
Hooks.on('renderChatMessageHTML', (message, html, context) => {
    // Enrich the message HTML
    ChatMessageWH40K.enrichDegreeBadge(html, message);
    ChatMessageWH40K.enrichSpeakerPortrait(html, message);
    ChatMessageWH40K.enrichActionButtons(html, message);

    // Add click listeners for WH40K-specific actions
    // Note: Existing roll-control__* listeners are handled by BasicActionManager
    html.querySelectorAll(
        '[data-action]:not(.roll-control__hide-control):not(.roll-control__refund):not(.roll-control__fate-reroll):not(.roll-control__assign-damage):not(.roll-control__apply-damage)',
    ).forEach((btn) => {
        btn.addEventListener('click', async (event) => {
            await ChatMessageWH40K.onChatCardAction(event, html);
        });
    });
});
