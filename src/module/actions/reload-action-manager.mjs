/**
 * @file ReloadActionManager - Handles weapon reload actions with action economy validation
 * Integrates with RogueTraderVTT-7jh Combat Actions System
 */

import { ConfirmationDialog } from '../applications/dialogs/_module.mjs';

/**
 * Manager for weapon reload actions.
 * Handles reload time calculation, action economy validation, and special qualities.
 */
export class ReloadActionManager {
    /**
     * Reload action time costs mapped to action economy.
     * @type {Object<string, {half: number, full: number, label: string}>}
     */
    static RELOAD_ACTION_COSTS = {
        '-': { half: 0, full: 0, label: 'No Reload' },
        'free': { half: 0, full: 0, label: 'Free Action' },
        'half': { half: 1, full: 0, label: 'Half Action' },
        'full': { half: 0, full: 1, label: 'Full Action' },
        '2-full': { half: 0, full: 2, label: '2 Full Actions' },
        '3-full': { half: 0, full: 3, label: '3 Full Actions' },
    };

    /**
     * Perform a weapon reload action.
     * @param {Item} weapon - The weapon item to reload
     * @param {object} options - Reload options
     * @param {boolean} options.skipValidation - Skip action economy validation (for out-of-combat)
     * @param {boolean} options.force - Force reload even if already full
     * @returns {Promise<{success: boolean, message: string, actionsSpent: {half: number, full: number}}>}
     */
    static async reloadWeapon(weapon, { skipValidation = false, force = false } = {}) {
        // Validate weapon
        if (!weapon || weapon.type !== 'weapon') {
            return {
                success: false,
                message: 'Invalid weapon',
                actionsSpent: { half: 0, full: 0 },
            };
        }

        const system = weapon.system;

        // Check if weapon uses ammo
        if (!system.usesAmmo) {
            return {
                success: false,
                message: `${weapon.name} does not use ammunition`,
                actionsSpent: { half: 0, full: 0 },
            };
        }

        // Check if already fully loaded (unless forced)
        if (!force && system.clip.value >= system.clip.max) {
            return {
                success: false,
                message: `${weapon.name} is already fully loaded (${system.clip.max}/${system.clip.max})`,
                actionsSpent: { half: 0, full: 0 },
            };
        }

        // Calculate effective reload time (accounting for Customised quality)
        const effectiveReloadTime = this.getEffectiveReloadTime(weapon);
        const reloadCost = this.RELOAD_ACTION_COSTS[effectiveReloadTime];

        if (!reloadCost) {
            return {
                success: false,
                message: `Invalid reload time: ${effectiveReloadTime}`,
                actionsSpent: { half: 0, full: 0 },
            };
        }

        // No reload needed
        if (effectiveReloadTime === '-') {
            return {
                success: false,
                message: `${weapon.name} cannot be reloaded`,
                actionsSpent: { half: 0, full: 0 },
            };
        }

        // Check action economy (only in combat if not skipped)
        if (!skipValidation && weapon.actor) {
            const canAfford = await this.validateActionEconomy(weapon.actor, reloadCost);
            if (!canAfford.success) {
                return {
                    success: false,
                    message: canAfford.message,
                    actionsSpent: { half: 0, full: 0 },
                };
            }
        }

        // Perform the reload
        const previousValue = system.clip.value;
        await weapon.update({ 'system.clip.value': system.clip.max });

        // Calculate rounds loaded
        const roundsLoaded = system.clip.max - previousValue;

        // Build success message
        let message = `${weapon.name} reloaded (${previousValue} → ${system.clip.max})`;
        if (roundsLoaded > 0) {
            message += ` [+${roundsLoaded} rounds]`;
        }
        message += ` - ${reloadCost.label}`;

        // Show Customised bonus if applicable
        if (this.hasCustomisedQuality(weapon) && effectiveReloadTime !== system.reload) {
            message += ` (Customised: ${system.reload} → ${effectiveReloadTime})`;
        }

        return {
            success: true,
            message,
            actionsSpent: reloadCost,
        };
    }

    /**
     * Get effective reload time accounting for Customised quality.
     * Customised halves reload time:
     * - Full → Half
     * - 2 Full → Full
     * - 3 Full → 2 Full (rounds up)
     * @param {Item} weapon - The weapon item
     * @returns {string} - Effective reload time
     */
    static getEffectiveReloadTime(weapon) {
        const baseReload = weapon.system.reload;

        // Check for Customised quality
        if (!this.hasCustomisedQuality(weapon)) {
            return baseReload;
        }

        // Customised halves reload time
        const reloadMap = {
            '3-full': '2-full',
            '2-full': 'full',
            'full': 'half',
            'half': 'half', // Already minimum (can't halve further)
            'free': 'free',
            '-': '-',
        };

        return reloadMap[baseReload] || baseReload;
    }

    /**
     * Check if weapon has Customised quality.
     * @param {Item} weapon - The weapon item
     * @returns {boolean}
     */
    static hasCustomisedQuality(weapon) {
        const qualities = weapon.system.effectiveSpecial;
        return qualities?.has('customised') ?? false;
    }

    /**
     * Validate that the actor has sufficient actions available.
     * This checks combat state and available action economy.
     * @param {Actor} actor - The actor attempting to reload
     * @param {object} actionCost - Action cost object with half/full counts
     * @returns {Promise<{success: boolean, message: string}>}
     */
    static async validateActionEconomy(actor, actionCost) {
        // If no actions required, always succeed (free action)
        if (actionCost.half === 0 && actionCost.full === 0) {
            return { success: true, message: 'Free action' };
        }

        // Check if in combat
        const combat = game.combat;
        const isInCombat = combat?.started && combat.combatants.some((c) => c.actorId === actor.id);

        if (!isInCombat) {
            // Out of combat - allow reload with notification
            return { success: true, message: 'Out of combat - no action cost' };
        }

        // In combat - check available actions
        // Note: The combat action tracking system (RogueTraderVTT-7jh) should provide
        // methods to check and spend actions. For now, we'll use a simple notification.

        // Check if it's the actor's turn
        const currentCombatant = combat.combatant;
        const isActorsTurn = currentCombatant?.actorId === actor.id;

        if (!isActorsTurn) {
            // Not actor's turn - ask for confirmation
            const confirmed = await ConfirmationDialog.confirm({
                title: 'Reload Out of Turn',
                content: `<p>It is not ${actor.name}'s turn.</p><p>Reload anyway? This will not track action economy.</p>`,
                confirmLabel: 'Reload',
                cancelLabel: 'Cancel',
            });

            if (!confirmed) {
                return { success: false, message: 'Reload cancelled' };
            }

            return { success: true, message: 'Reload performed out of turn (no action tracking)' };
        }

        // Actor's turn - validate action economy
        // TODO: Integrate with combat action tracking system when available
        // For now, we'll allow the reload and notify about the cost

        const actionDescription = this._getActionCostDescription(actionCost);
        return {
            success: true,
            message: `Reload requires: ${actionDescription}`,
        };
    }

    /**
     * Get a human-readable description of action cost.
     * @param {object} actionCost - Action cost object
     * @returns {string}
     * @private
     */
    static _getActionCostDescription(actionCost) {
        const parts = [];
        if (actionCost.full > 0) {
            parts.push(`${actionCost.full} Full Action${actionCost.full > 1 ? 's' : ''}`);
        }
        if (actionCost.half > 0) {
            parts.push(`${actionCost.half} Half Action${actionCost.half > 1 ? 's' : ''}`);
        }
        return parts.join(' + ') || 'Free Action';
    }

    /**
     * Send reload action to chat.
     * @param {Actor} actor - The actor performing the reload
     * @param {Item} weapon - The weapon being reloaded
     * @param {object} result - Reload result object
     * @returns {Promise<ChatMessage>}
     */
    static async sendReloadToChat(actor, weapon, result) {
        const templateData = {
            actor: actor,
            weapon: weapon,
            result: result,
            effectiveReloadTime: this.getEffectiveReloadTime(weapon),
            baseReloadTime: weapon.system.reload,
            hasCustomised: this.hasCustomisedQuality(weapon),
            clipCurrent: weapon.system.clip.value,
            clipMax: weapon.system.clip.max,
        };

        const html = await renderTemplate('systems/rogue-trader/templates/chat/reload-action-chat.hbs', templateData);

        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content: html,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            flavor: `${weapon.name} - Reload`,
        };

        return ChatMessage.create(chatData);
    }

    /**
     * Check for spare magazines in actor inventory.
     * @param {Actor} actor - The actor
     * @param {Item} weapon - The weapon
     * @returns {Array<Item>} - Array of compatible ammunition items
     */
    static findSpareAmmunition(actor, weapon) {
        if (!actor || !weapon) return [];

        const ammoType = weapon.system.clip.type;
        if (!ammoType) return [];

        // Find ammunition items in inventory matching the weapon's clip type
        return actor.items.filter((item) => {
            return item.type === 'ammunition' && item.system.ammunitionType === ammoType;
        });
    }

    /**
     * Check if actor has spare ammunition available.
     * @param {Actor} actor - The actor
     * @param {Item} weapon - The weapon
     * @returns {boolean}
     */
    static hasSpareAmmunition(actor, weapon) {
        const spareAmmo = this.findSpareAmmunition(actor, weapon);
        return spareAmmo.length > 0 && spareAmmo.some((ammo) => ammo.system.quantity > 0);
    }
}

export const DHReloadActionManager = new ReloadActionManager();
