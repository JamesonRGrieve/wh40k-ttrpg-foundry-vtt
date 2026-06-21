import { getDegreeForMode, isD100Success, resolveDegreesMethod } from '../rolls/roll-helpers.ts';

/**
 * Minimal shape of a per-system item document as probed by chat-card actions.
 * The result of each roll/use dispatch is discarded by the handler, so each
 * method is typed `Promise<void>`; the concrete documents return richer values
 * (ChatMessage / roll results) that are intentionally ignored here.
 */
interface RollableItem {
    type?: string;
    actor?: ActorWithCombatActions | null;
    rollDamage?: () => Promise<void>;
    use?: () => Promise<void>;
    roll?: () => Promise<void>;
}

/**
 * Minimal shape of a per-system actor document as probed by chat-card combat
 * actions. `update` and `applyDamage`'s options bag are Foundry update-payload
 * boundaries (ad-hoc consumer fields), so they keep `Record<string, unknown>`.
 */
interface ActorWithCombatActions {
    rollWeaponDamage?: (item: RollableItem) => Promise<void>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: applyDamage options bag is an ad-hoc consumer field set, not a DataModel-backed shape
    applyDamage?: (damage: number, options: Record<string, unknown>) => Promise<void>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry Document.update accepts a free-form update payload
    update: (data: Record<string, unknown>) => Promise<void>;
    system: { wounds?: { value?: number } };
}

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
        const flag = this.getFlag('wh40k-rpg', 'itemCard');
        return flag !== undefined && flag !== null;
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
    get itemUuid(): string | null {
        const v = this.getFlag('wh40k-rpg', 'item.uuid');
        return typeof v === 'string' ? v : null;
    }

    /* -------------------------------------------- */
    /*  Roll Result Helpers                         */
    /* -------------------------------------------- */

    /**
     * Calculate degrees of success or failure for a d100 roll
     * @returns {{success: boolean, degrees: number}|null}
     */
    calculateDegrees(): { success: boolean; degrees: number } | null {
        if (!this.isRoll || this.rolls.length === 0) return null;

        const roll = this.rolls[0];
        const target = this.getFlag('wh40k-rpg', 'target');

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: this.rolls[0] may be undefined despite length check
        if (target === undefined || target === null || roll === undefined) return null;

        // Check if this is a d100 roll
        const total = roll.total;
        if (total === undefined) return null;
        const targetNum = Number(target);
        const success = isD100Success(total, targetNum);
        const method = resolveDegreesMethod((this.speakerActor?.system as { gameSystem?: string } | undefined)?.gameSystem);
        const degrees = 1 + (success ? getDegreeForMode(method, targetNum, total) : getDegreeForMode(method, total, targetNum));

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
        if (itemUuid === null || itemUuid === '') {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Chat.NoItemFound', { localize: true });
            return;
        }

        const item = (await fromUuid(itemUuid)) as RollableItem | null;
        if (item === null) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Chat.ItemNotFound', { localize: true });
            return;
        }

        // Check if item has a rollDamage method
        if (typeof item.rollDamage === 'function') {
            await item.rollDamage();
        } else if (item.type === 'weapon') {
            // Fallback for weapons without rollDamage method
            const actor = item.actor;
            if (actor !== null && actor !== undefined && typeof actor.rollWeaponDamage === 'function') {
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: damage application options accept ad-hoc consumer fields
    async applyDamage(damage: number, options: Record<string, unknown> = {}): Promise<void> {
        const targets = game.user.targets;

        if (targets.size === 0) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Chat.NoTokensTargeted', { localize: true });
            return;
        }

        for (const token of targets) {
            const actor = token.actor as ActorWithCombatActions | null;
            if (actor === null) continue;

            if (typeof actor.applyDamage === 'function') {
                // eslint-disable-next-line no-await-in-loop -- damage application is sequenced per target by design
                await actor.applyDamage(damage, options);
            } else {
                // Fallback: directly modify wounds
                const currentWounds = actor.system.wounds?.value ?? 0;
                const newWounds = Math.max(0, currentWounds - damage);
                // eslint-disable-next-line no-await-in-loop -- update sequenced per target
                await actor.update({ 'system.wounds.value': newWounds });
            }
        }
    }

    /**
     * Use an item from its card
     * @returns {Promise<void>}
     */
    async useItem(): Promise<void> {
        const itemUuid = this.itemUuid;
        if (itemUuid === null || itemUuid === '') {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
            ui.notifications.warn('WH40K.Chat.NoItemFound', { localize: true });
            return;
        }

        const item = (await fromUuid(itemUuid)) as RollableItem | null;
        if (item === null) {
            // eslint-disable-next-line no-restricted-syntax -- string is a localization key passed via { localize: true }
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
    // eslint-disable-next-line complexity -- linear router over a fixed set of chat-card action verbs
    static async onChatCardAction(event: Event, _html: HTMLElement): Promise<void> {
        event.preventDefault();
        const button = event.currentTarget as HTMLElement;
        const action = button.dataset['action'];

        // Get the message from the card
        const card = button.closest<HTMLElement>('.chat-message');
        if (card === null) return;

        const messageId = card.dataset['messageId'] ?? '';
        const message = game.messages.get(messageId);

        if (message === undefined) {
            console.warn('WH40K | ChatMessage not found for action:', action);
            return;
        }

        // Route to appropriate handler
        if (action === undefined) return;
        if (action === 'rollDamage' || action === 'damage') {
            await (message as ChatMessageWH40K).rollDamage();
            return;
        }
        if (action === 'applyDamage') {
            const damage = parseInt(button.dataset['damage'] ?? '0', 10) || 0;
            const options = {
                damageType: button.dataset['damageType'],
                penetration: parseInt(button.dataset['penetration'] ?? '0', 10) || 0,
                location: button.dataset['location'],
            };
            await (message as ChatMessageWH40K).applyDamage(damage, options);
            return;
        }
        if (action === 'useItem' || action === 'use') {
            await (message as ChatMessageWH40K).useItem();
            return;
        }
        if (action === 'attack') {
            const itemUuid = button.dataset['itemUuid'] ?? (message as ChatMessageWH40K).itemUuid;
            if (itemUuid !== null && itemUuid !== '') {
                const item = (await fromUuid(itemUuid)) as RollableItem | null;
                const actor = item?.actor;
                if (item !== null && actor !== null) {
                    // Import and use targeted action manager
                    const { DHTargetedActionManager } = await import('../actions/targeted-action-manager.ts');
                    DHTargetedActionManager.performWeaponAttack(actor as never, null, item as never);
                }
            }
            return;
        }
        if (action === 'roll') {
            const itemUuid = button.dataset['itemUuid'] ?? (message as ChatMessageWH40K).itemUuid;
            if (itemUuid !== null && itemUuid !== '') {
                const item = (await fromUuid(itemUuid)) as RollableItem | null;
                if (item !== null && typeof item.roll === 'function') {
                    await item.roll();
                }
            }
            return;
        }
        game.wh40k.log(`Unknown chat action: ${action}`);
    }

    /**
     * Enrich a degree badge into roll result HTML
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichDegreeBadge(html: HTMLElement, message: ChatMessageWH40K): void {
        const result = message.calculateDegrees();
        if (result === null) return;

        const { success, degrees } = result;

        // Find the dice total element
        const diceTotal = html.querySelector('.dice-total');
        if (diceTotal === null) return;

        // Check if badge already exists
        if (diceTotal.querySelector('.wh40k-degree-badge') !== null) return;

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
    static enrichSpeakerPortrait(html: HTMLElement, message: ChatMessageWH40K): void {
        const actor = message.speakerActor;
        if (actor === null) return;

        const sender = html.querySelector('.message-sender');
        if (sender === null) return;

        // Check if portrait already exists
        if (sender.querySelector('.wh40k-message-portrait') !== null) return;

        const portrait = document.createElement('img');
        portrait.className =
            'wh40k-message-portrait tw-w-7 tw-h-7 tw-object-cover tw-rounded-full tw-border-2 tw-border-gold tw-mr-2 tw-shadow-[0_2px_4px_var(--wh40k-shadow-medium)]';
        portrait.src = actor.img ?? '';
        portrait.alt = actor.name;

        sender.prepend(portrait);
    }

    /**
     * Add message ID to action buttons that need it
     * @param {HTMLElement} html - The message HTML
     * @param {ChatMessageWH40K} message - The chat message
     */
    static enrichActionButtons(html: HTMLElement, message: ChatMessageWH40K): void {
        const messageId = message.id ?? '';
        html.querySelectorAll('[data-action]').forEach((btn) => {
            // Add message ID if not present
            const btnEl = btn as HTMLElement;
            if (btnEl.dataset['messageId'] === undefined || btnEl.dataset['messageId'] === '') {
                btnEl.dataset['messageId'] = messageId;
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
        '[data-action]:not(.roll-control__hide-control):not(.roll-control__refund):not(.roll-control__fate-reroll):not(.roll-control__assign-damage):not(.roll-control__apply-damage):not(.roll-control__horde-break-test)',
    ).forEach((btn: Element) => {
        btn.addEventListener('click', (event: Event) => {
            void ChatMessageWH40K.onChatCardAction(event, html);
        });
    });
});
