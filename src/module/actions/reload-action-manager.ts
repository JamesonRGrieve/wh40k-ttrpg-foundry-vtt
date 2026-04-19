/**
 * @file ReloadActionManager - Handles weapon reload actions with action economy validation
 * Integrates with WH40KVTT-7jh Combat Actions System
 */

import { AmmoPickerDialog, ConfirmationDialog } from '../applications/dialogs/_module.ts';

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
        const actor = weapon.actor;

        // Check if weapon uses ammo
        if (!system.usesAmmo) {
            return {
                success: false,
                message: `${weapon.name} does not use ammunition`,
                actionsSpent: { half: 0, full: 0 },
            };
        }

        // Check if already fully loaded (unless forced)
        const effectiveMax = system.effectiveClipMax;
        if (!force && system.clip.value >= effectiveMax) {
            return {
                success: false,
                message: `${weapon.name} is already fully loaded (${effectiveMax}/${effectiveMax})`,
                actionsSpent: { half: 0, full: 0 },
            };
        }

        // Check that actor has spare ammunition
        if (actor) {
            if (!this.hasSpareAmmunition(actor, weapon)) {
                return {
                    success: false,
                    message: `No compatible ammunition available for ${weapon.name}`,
                    actionsSpent: { half: 0, full: 0 },
                };
            }
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
        if (!skipValidation && actor) {
            const canAfford = await this.validateActionEconomy(actor, reloadCost);
            if (!canAfford.success) {
                return {
                    success: false,
                    message: canAfford.message,
                    actionsSpent: { half: 0, full: 0 },
                };
            }
        }

        // --- Inventory-aware reload ---
        const previousValue = system.clip.value;

        if (actor) {
            // Step 1: Return remaining rounds to inventory
            if (previousValue > 0 && system.hasLoadedAmmo) {
                await system._returnRoundsToInventory(actor, previousValue);
            }

            // Step 2: Select ammo type
            const spareAmmo = this.findSpareAmmunition(actor, weapon);
            if (spareAmmo.length === 0) {
                // Edge case: ammo was returned but nothing available (shouldn't happen, but guard)
                return {
                    success: false,
                    message: `No compatible ammunition available for ${weapon.name}`,
                    actionsSpent: { half: 0, full: 0 },
                };
            }

            const selectedAmmo = await AmmoPickerDialog.pick({
                ammoItems: spareAmmo,
                currentAmmoUuid: system.loadedAmmo?.uuid,
                weaponName: weapon.name,
                clipMax: effectiveMax,
            });

            if (!selectedAmmo) {
                // User cancelled — restore the rounds we returned
                if (previousValue > 0 && system.hasLoadedAmmo) {
                    // Re-deduct the rounds we just returned (reverse the return)
                    const prevAmmoItem =
                        actor.items.find((i) => i.uuid === system.loadedAmmo.uuid) ||
                        actor.items.find((i) => i.type === 'ammunition' && i.name === system.loadedAmmo.name);
                    if (prevAmmoItem) {
                        await prevAmmoItem.update({ 'system.quantity': prevAmmoItem.system.quantity - previousValue });
                    }
                }
                return {
                    success: false,
                    message: 'Reload cancelled',
                    actionsSpent: { half: 0, full: 0 },
                };
            }

            // Step 3: Calculate and load rounds
            const clipMod = selectedAmmo.system.clipModifier ?? 0;
            const newEffectiveMax = Math.max(1, system.clip.max + clipMod);
            const roundsToLoad = Math.min(newEffectiveMax, selectedAmmo.system.quantity);

            // Deduct rounds from inventory
            await selectedAmmo.update({ 'system.quantity': selectedAmmo.system.quantity - roundsToLoad });

            // Update weapon — set loadedAmmo reference if different type
            const isSameAmmo = selectedAmmo.uuid === system.loadedAmmo?.uuid;
            const updateData: Record<string, any> = { 'system.clip.value': roundsToLoad };

            if (!isSameAmmo) {
                updateData['system.loadedAmmo'] = {
                    uuid: selectedAmmo.uuid,
                    name: selectedAmmo.name,
                    modifiers: {
                        damage: selectedAmmo.system.modifiers?.damage ?? 0,
                        penetration: selectedAmmo.system.modifiers?.penetration ?? 0,
                        range: selectedAmmo.system.modifiers?.range ?? 0,
                    },
                    clipModifier: clipMod,
                    addedQualities: selectedAmmo.system.addedQualities || new Set(),
                    removedQualities: selectedAmmo.system.removedQualities || new Set(),
                };
            }

            await weapon.update(updateData);

            // Build success message
            let message = `${weapon.name} reloaded with ${selectedAmmo.name} (${previousValue} → ${roundsToLoad})`;
            if (roundsToLoad < newEffectiveMax) {
                message += ` [partial — only ${roundsToLoad} rounds available]`;
            }
            message += ` — ${reloadCost.label}`;

            if (this.hasCustomisedQuality(weapon) && effectiveReloadTime !== system.reload) {
                message += ` (Customised: ${system.reload} → ${effectiveReloadTime})`;
            }

            return {
                success: true,
                message,
                actionsSpent: reloadCost,
            };
        }

        // Fallback for unowned weapons (no actor) — simple reload without inventory
        await weapon.update({ 'system.clip.value': effectiveMax });

        return {
            success: true,
            message: `${weapon.name} reloaded (${previousValue} → ${effectiveMax}) — ${reloadCost.label}`,
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
        // @ts-expect-error - property access
        const isInCombat = combat?.started && combat.combatants.some((c) => c.actorId === actor.id);

        if (!isInCombat) {
            // Out of combat - allow reload with notification
            return { success: true, message: 'Out of combat - no action cost' };
        }

        // In combat - check available actions
        // Note: The combat action tracking system (WH40KVTT-7jh) should provide
        // methods to check and spend actions. For now, we'll use a simple notification.

        // Check if it's the actor's turn
        const currentCombatant = combat.combatant;
        // @ts-expect-error - property access
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
            clipMax: weapon.system.effectiveClipMax,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/reload-action-chat.hbs', templateData);

        const chatData = {
            user: game.user.id,
            speaker: (ChatMessage as any).getSpeaker({ actor }),
            content: html,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            flavor: `${weapon.name} - Reload`,
        };

        return (ChatMessage as any).create(chatData);
    }

    /**
     * Find compatible ammunition in actor inventory.
     * Matches by weapon type against ammo's weaponTypes set.
     * @param {Actor} actor - The actor
     * @param {Item} weapon - The weapon
     * @returns {Array<Item>} - Array of compatible ammunition items with quantity > 0, sorted with currently loaded type first
     */
    static findSpareAmmunition(actor, weapon) {
        if (!actor || !weapon) return [];

        const weaponType = weapon.system.type;
        const currentAmmoUuid = weapon.system.loadedAmmo?.uuid;

        // Find ammunition items compatible with this weapon type that have rounds available
        const compatible = actor.items.filter((item) => {
            if (item.type !== 'ammunition') return false;
            if (item.system.quantity <= 0) return false;
            const ammoWeaponTypes = item.system.weaponTypes;
            // Universal ammo (empty weaponTypes set) is compatible with all weapons
            if (!ammoWeaponTypes || ammoWeaponTypes.size === 0) return true;
            return ammoWeaponTypes.has(weaponType);
        });

        // Sort: currently loaded type first, then alphabetical
        compatible.sort((a, b) => {
            if (a.uuid === currentAmmoUuid) return -1;
            if (b.uuid === currentAmmoUuid) return 1;
            return a.name.localeCompare(b.name);
        });

        return compatible;
    }

    /**
     * Check if actor has spare ammunition available for a weapon.
     * @param {Actor} actor - The actor
     * @param {Item} weapon - The weapon
     * @returns {boolean}
     */
    static hasSpareAmmunition(actor, weapon) {
        return this.findSpareAmmunition(actor, weapon).length > 0;
    }
}

export const DHReloadActionManager = new ReloadActionManager();
