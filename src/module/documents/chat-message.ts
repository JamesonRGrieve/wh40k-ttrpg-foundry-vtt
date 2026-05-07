/**
 * Extended ChatMessage class for WH40K RPG VTT
 * Provides custom rendering, interactive action buttons, and DoS/DoF display
 * @extends ChatMessage
 */
export class ChatMessageWH40K extends ChatMessage {
    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the actor associated with this message's speaker
     * @type {Actor|null}
     */
    override get speakerActor(): Actor.Implementation | null {
        return ChatMessage.getSpeakerActor(this.speaker);
    }

    /**
     * Check if this message is an item card
     * @type {boolean}
     */
    get isItemCard(): boolean {
        return !!this.getFlag('wh40k-rpg', 'itemCard');
    }

    /**
     * Check if this message is a roll with a target
     * @type {boolean}
     */
    get isTargetedRoll(): boolean {
        return this.isRoll && this.getFlag('wh40k-rpg', 'target') !== undefined;
    }

    /**
     * Get the item UUID if this is an item card
     * @type {string|null}
     */
    get itemUuid(): unknown {
        return this.getFlag('wh40k-rpg', 'item.uuid') ?? null;
    }

    /* -------------------------------------------- */
    /*  Roll Result Helpers                         */
    /* -------------------------------------------- */

    /**
     * Calculate degrees of success or failure for a d100 roll
     * @returns {{success: boolean, degrees: number}|null}
     */
    calculateDegrees(): { success: boolean; degrees: number } | null {
        if (!this.isRoll || !this.rolls?.length) return null;

        const roll = this.rolls[0];
        const target = this.getFlag('wh40k-rpg', 'target');

        if (target === undefined || target === null) return null;

        // Check if this is a d100 roll
        const total = roll.total;
        if (total === undefined) return null;
        const targetNum = Number(target);
        const success = total <= targetNum;
        const degrees = Math.floor(Math.abs(total - targetNum) / 10);

        return { success, degrees };
    }

    /* -------------------------------------------- */
    /*  Action Handlers                             */
    /* -------------------------------------------- */

    /**
     * Roll damage from an item card
     * @returns {Promise<void>}
     */
    async rollDamage(): Promise<void> {
        const itemUuid = this.itemUuid;
        if (!itemUuid || typeof itemUuid !== 'string') {
            ui.notifications.warn('WH40K.Chat.NoItemFound', { localize: true });
            return;
        }

        const item = (await fromUuid(itemUuid)) as (foundry.abstract.Document.Any & Record<string, unknown>) | null;
        if (!item) {
            ui.notifications.warn('WH40K.Chat.ItemNotFound', { localize: true });
            return;
        }

        // Check if item has a rollDamage method
        if (typeof item.rollDamage === 'function') {
            await item.rollDamage();
        } else if (item.type === 'weapon') {
            // Fallback for weapons without rollDamage method
            const actor = item.actor as (foundry.abstract.Document.Any & Record<string, unknown>) | undefined;
            if (actor && typeof actor.rollWeaponDamage === 'function') {
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
    async applyDamage(damage: number, options: Record<string, unknown> = {}): Promise<void> {
        const targets = game.user.targets;

        if (targets.size === 0) {
            ui.notifications.warn('WH40K.Chat.NoTokensTargeted', { localize: true });
            return;
        }

        for (const token of targets) {
            const actor = token.actor as (Actor & Record<string, unknown>) | null;
            if (!actor) continue;

            if (typeof actor.applyDamage === 'function') {
                await actor.applyDamage(damage, options);
            } else {
                // Fallback: directly modify wounds
                const actorSystem = actor.system as Record<string, unknown> & { wounds?: { value?: number } };
                const currentWounds = actorSystem.wounds?.value ?? 0;
                const newWounds = Math.max(0, currentWounds - damage);
                await actor.update({ 'system.wounds.value': newWounds } as Record<string, unknown>);
            }
        }
    }

    /**
     * Use an item from its card
     * @returns {Promise<void>}
     */
    async useItem(): Promise<void> {
        const itemUuid = this.itemUuid;
        if (!itemUuid || typeof itemUuid !== 'string') {
            ui.notifications.warn('WH40K.Chat.NoItemFound', { localize: true });
            return;
        }

        const item = (await fromUuid(itemUuid)) as (foundry.abstract.Document.Any & Record<string, unknown>) | null;
        if (!item) {
            ui.notifications.warn('WH40K.Chat.ItemNotFound', { localize: true });
            return;
        }

        // Use the item if it has a use method
        if (typeof item.use === 'function') {
            await item.use();
        } else if (typeof item.roll === 'function') {
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
    static async onChatCardAction(event: Event, html: HTMLElement): Promise<void> {
        event.preventDefault();
        const button = event.currentTarget as HTMLElement;
        const action = button.dataset.action;

        // Get the message from the card
        const card = button.closest('.chat-message') as HTMLElement | null;
        if (!card) return;

        const messageId = card.dataset.messageId;
        const message = game.messages.get(messageId ?? '');

        if (!message) {
            console.warn('WH40K | ChatMessage not found for action:', action);
            return;
        }

        // Route to appropriate handler
        switch (action) {
            case 'rollDamage':
            case 'damage':
                await (message as ChatMessageWH40K).rollDamage();
                return;

            case 'applyDamage': {
                const damage = parseInt(button.dataset.damage ?? '0') || 0;
                const options = {
                    damageType: button.dataset.damageType,
                    penetration: parseInt(button.dataset.penetration ?? '0') || 0,
                    location: button.dataset.location,
                };
                await (message as ChatMessageWH40K).applyDamage(damage, options);
                return;
            }

            case 'useItem':
            case 'use':
                await (message as ChatMessageWH40K).useItem();
                return;

            case 'attack': {
                const rawUuid = button.dataset.itemUuid ?? ((message as ChatMessageWH40K).itemUuid as string | null | undefined);
                const itemUuid = typeof rawUuid === 'string' ? rawUuid : null;
                if (itemUuid) {
                    const item = (await fromUuid(itemUuid)) as (foundry.abstract.Document.Any & Record<string, unknown>) | null;
                    const actor = item?.actor as (foundry.abstract.Document.Any & Record<string, unknown>) | undefined;
                    if (item && actor) {
                        // Import and use targeted action manager
                        const { DHTargetedActionManager } = await import('../actions/targeted-action-manager.ts');
                        await DHTargetedActionManager.performWeaponAttack(actor as never, null, item as never);
                    }
                }
                return;
            }

            case 'roll': {
                const rawUuid = button.dataset.itemUuid ?? ((message as ChatMessageWH40K).itemUuid as string | null | undefined);
                const itemUuid = typeof rawUuid === 'string' ? rawUuid : null;
                if (itemUuid) {
                    const item = (await fromUuid(itemUuid)) as (foundry.abstract.Document.Any & Record<string, unknown>) | null;
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
    static enrichDegreeBadge(html: HTMLElement, message: ChatMessageWH40K) {
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
        const badgeBase =
            'wh40k-degree-badge tw-inline-flex tw-items-center tw-justify-center tw-ml-2 tw-px-2 tw-py-0.5 tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[0.05em] tw-rounded-[3px] tw-align-middle';
        const badgeVariant = success
            ? 'wh40k-degree-badge--success tw-bg-[var(--wh40k-success-bg)] tw-border tw-border-[var(--wh40k-success-primary)] tw-text-[var(--wh40k-success-secondary)]'
            : 'wh40k-degree-badge--failure tw-bg-[var(--wh40k-danger-bg)] tw-border tw-border-[var(--wh40k-danger-primary)] tw-text-[var(--wh40k-danger-secondary)]';
        badge.className = `${badgeBase} ${badgeVariant}`;
        badge.textContent = `${degrees} ${success ? 'DoS' : 'DoF'}`;

        diceTotal.appendChild(badge);
    }

    /**
     * Add speaker portrait to message if missing
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichSpeakerPortrait(html: HTMLElement, message: ChatMessageWH40K) {
        const actor = message.speakerActor;
        if (!actor) return;

        const sender = html.querySelector('.message-sender');
        if (!sender) return;

        // Check if portrait already exists
        if (sender.querySelector('.wh40k-message-portrait')) return;

        const portrait = document.createElement('img');
        portrait.className =
            'wh40k-message-portrait tw-w-7 tw-h-7 tw-object-cover tw-rounded-full tw-border-2 tw-border-gold tw-mr-2 tw-shadow-[0_2px_4px_var(--wh40k-shadow-medium)]';
        portrait.src = actor.img !== null ? actor.img : '';
        portrait.alt = actor.name !== null ? actor.name : '';

        sender.prepend(portrait);
    }

    /**
     * Add message ID to action buttons that need it
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichActionButtons(html: HTMLElement, message: ChatMessageWH40K) {
        html.querySelectorAll('[data-action]').forEach((btn) => {
            // Add message ID if not present
            const btnEl = btn as HTMLElement;
            if (!btnEl.dataset.messageId) {
                btnEl.dataset.messageId = message.id ?? '';
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
Hooks.on('renderChatMessageHTML', (message: ChatMessageWH40K, html: HTMLElement, _context: ChatMessage.MessageData) => {
    // Enrich the message HTML
    ChatMessageWH40K.enrichDegreeBadge(html, message);
    ChatMessageWH40K.enrichSpeakerPortrait(html, message);
    ChatMessageWH40K.enrichActionButtons(html, message);

    // Add click listeners for WH40K-specific actions
    // Note: Existing roll-control__* listeners are handled by BasicActionManager
    html.querySelectorAll(
        '[data-action]:not(.roll-control__hide-control):not(.roll-control__refund):not(.roll-control__fate-reroll):not(.roll-control__assign-damage):not(.roll-control__apply-damage)',
    ).forEach((btn: Element) => {
        btn.addEventListener('click', async (event: Event) => {
            await ChatMessageWH40K.onChatCardAction(event, html);
        });
    });
});
