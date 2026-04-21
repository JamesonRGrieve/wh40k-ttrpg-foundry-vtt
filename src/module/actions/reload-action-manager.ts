/**
 * @file ReloadActionManager - Handles weapon reload actions with action economy validation
 * Integrates with WH40KVTT-7jh Combat Actions System
 */

import { AmmoPickerDialog, ConfirmationDialog } from '../applications/dialogs/_module.ts';
import { WH40KBaseActor } from '../documents/base-actor.ts';
import { WH40KItem } from '../documents/item.ts';
import WeaponData from '../data/item/weapon.ts';
import AmmunitionData from '../data/item/ammunition.ts';

interface AmmunitionDataWithQuantity extends AmmunitionData {
    quantity?: number;
}

type ReloadWeaponSystem = WeaponData & { reload: string };

/**
 * Action cost object with half/full counts
 */
export interface ReloadActionCost {
    half: number;
    full: number;
    label: string;
}

/**
 * Reload result object
 */
export interface ReloadResult {
    success: boolean;
    message: string;
    actionsSpent: ReloadActionCost;
}

/**
 * Manager for weapon reload actions.
 * Handles reload time calculation, action economy validation, and special qualities.
 */
export class ReloadActionManager {
    private static getWeaponSystem(weapon: WH40KItem): ReloadWeaponSystem {
        return weapon.system as unknown as ReloadWeaponSystem;
    }

    private static getAmmoSystem(item: WH40KItem): AmmunitionDataWithQuantity {
        return item.system as unknown as AmmunitionDataWithQuantity;
    }

    /**
     * Reload action time costs mapped to action economy.
     */
    static RELOAD_ACTION_COSTS: Record<string, ReloadActionCost> = {
        '-': { half: 0, full: 0, label: 'No Reload' },
        'free': { half: 0, full: 0, label: 'Free Action' },
        'half': { half: 1, full: 0, label: 'Half Action' },
        'full': { half: 0, full: 1, label: 'Full Action' },
        '2-full': { half: 0, full: 2, label: '2 Full Actions' },
        '3-full': { half: 0, full: 3, label: '3 Full Actions' },
    };

    /**
     * Perform a weapon reload action.
     * @param weapon - The weapon item to reload
     * @param options - Reload options
     * @returns Reload result
     */
    static async reloadWeapon(weapon: WH40KItem, { skipValidation = false, force = false } = {}): Promise<ReloadResult> {
        // Validate weapon
        if (!weapon || weapon.type !== 'weapon') {
            return {
                success: false,
                message: 'Invalid weapon',
                actionsSpent: { half: 0, full: 0, label: '' },
            };
        }

        const system = this.getWeaponSystem(weapon);
        const actor = weapon.actor as unknown as WH40KBaseActor | null;

        // Check if weapon uses ammo
        if (!system.usesAmmo) {
            return {
                success: false,
                message: `${weapon.name} does not use ammunition`,
                actionsSpent: { half: 0, full: 0, label: '' },
            };
        }

        // Check if already fully loaded (unless forced)
        const effectiveMax = system.effectiveClipMax;
        if (!force && system.clip.value >= effectiveMax) {
            return {
                success: false,
                message: `${weapon.name} is already fully loaded (${effectiveMax}/${effectiveMax})`,
                actionsSpent: { half: 0, full: 0, label: '' },
            };
        }

        // Check that actor has spare ammunition
        if (actor) {
            if (!this.hasSpareAmmunition(actor, weapon)) {
                return {
                    success: false,
                    message: `No compatible ammunition available for ${weapon.name}`,
                    actionsSpent: { half: 0, full: 0, label: '' },
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
                actionsSpent: { half: 0, full: 0, label: '' },
            };
        }

        // No reload needed
        if (effectiveReloadTime === '-') {
            return {
                success: false,
                message: `${weapon.name} cannot be reloaded`,
                actionsSpent: { half: 0, full: 0, label: '' },
            };
        }

        // Check action economy (only in combat if not skipped)
        if (!skipValidation && actor) {
            const canAfford = await this.validateActionEconomy(actor, reloadCost);
            if (!canAfford.success) {
                return {
                    success: false,
                    message: canAfford.message,
                    actionsSpent: { half: 0, full: 0, label: '' },
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
                    actionsSpent: { half: 0, full: 0, label: '' },
                };
            }

            const selectedAmmo = (await AmmoPickerDialog.pick({
                ammoItems: spareAmmo,
                currentAmmoUuid: system.loadedAmmo?.uuid,
                weaponName: weapon.name,
                clipMax: effectiveMax,
            })) as WH40KItem | null;

            if (!selectedAmmo) {
                // User cancelled — restore the rounds we returned
                if (previousValue > 0 && system.hasLoadedAmmo) {
                    // Re-deduct the rounds we just returned (reverse the return)
                    const prevAmmoItem =
                        actor.items.find((i: WH40KItem) => i.uuid === system.loadedAmmo.uuid) ||
                        actor.items.find((i: WH40KItem) => i.type === 'ammunition' && i.name === system.loadedAmmo.name);
                    if (prevAmmoItem) {
                        const ammoSystem = this.getAmmoSystem(prevAmmoItem);
                        await prevAmmoItem.update({ 'system.quantity': (ammoSystem.quantity || 0) - previousValue });
                    }
                }
                return {
                    success: false,
                    message: 'Reload cancelled',
                    actionsSpent: { half: 0, full: 0, label: '' },
                };
            }

            // Step 3: Calculate and load rounds
            const ammoSystem = this.getAmmoSystem(selectedAmmo);
            const clipMod = ammoSystem.clipModifier ?? 0;
            const newEffectiveMax = Math.max(1, system.clip.max + clipMod);
            const roundsToLoad = Math.min(newEffectiveMax, ammoSystem.quantity || 0);

            // Deduct rounds from inventory
            await selectedAmmo.update({ 'system.quantity': (ammoSystem.quantity || 0) - roundsToLoad });

            // Update weapon — set loadedAmmo reference if different type
            const isSameAmmo = selectedAmmo.uuid === system.loadedAmmo?.uuid;
            const updateData: Record<string, unknown> = { 'system.clip.value': roundsToLoad };

            if (!isSameAmmo) {
                updateData['system.loadedAmmo'] = {
                    uuid: selectedAmmo.uuid,
                    name: selectedAmmo.name,
                    modifiers: {
                        damage: ammoSystem.modifiers?.damage ?? 0,
                        penetration: ammoSystem.modifiers?.penetration ?? 0,
                        range: ammoSystem.modifiers?.range ?? 0,
                    },
                    clipModifier: clipMod,
                    addedQualities: ammoSystem.addedQualities || new Set(),
                    removedQualities: ammoSystem.removedQualities || new Set(),
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
     * @param weapon - The weapon item
     * @returns Effective reload time
     */
    static getEffectiveReloadTime(weapon: WH40KItem): string {
        const system = this.getWeaponSystem(weapon);
        const baseReload = system.reload;

        // Check for Customised quality
        if (!this.hasCustomisedQuality(weapon)) {
            return baseReload;
        }

        // Customised halves reload time
        const reloadMap: Record<string, string> = {
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
     * @param weapon - The weapon item
     * @returns
     */
    static hasCustomisedQuality(weapon: WH40KItem): boolean {
        const system = this.getWeaponSystem(weapon);
        const qualities = system.effectiveSpecial;
        return qualities?.has('customised') ?? false;
    }

    /**
     * Validate that the actor has sufficient actions available.
     * @param actor - The actor attempting to reload
     * @param actionCost - Action cost object with half/full counts
     * @returns Success status and message
     */
    static async validateActionEconomy(actor: WH40KBaseActor, actionCost: ReloadActionCost): Promise<{ success: boolean; message: string }> {
        // If no actions required, always succeed (free action)
        if (actionCost.half === 0 && actionCost.full === 0) {
            return { success: true, message: 'Free action' };
        }

        // Check if in combat
        const combat = game.combat;
        const isInCombat = !!(combat?.started && combat.combatants.some((c: Combatant) => c.actor?.id === actor.id));

        if (!isInCombat) {
            // Out of combat - allow reload with notification
            return { success: true, message: 'Out of combat - no action cost' };
        }

        // Check if it's the actor's turn
        const currentCombatant = combat?.combatant;
        const isActorsTurn = !!(currentCombatant && currentCombatant.actor?.id === actor.id);

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

        const actionDescription = this._getActionCostDescription(actionCost);
        return {
            success: true,
            message: `Reload requires: ${actionDescription}`,
        };
    }

    /**
     * Get a human-readable description of action cost.
     * @param actionCost - Action cost object
     * @returns
     * @private
     */
    private static _getActionCostDescription(actionCost: ReloadActionCost): string {
        const parts: string[] = [];
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
     * @param actor - The actor performing the reload
     * @param weapon - The weapon being reloaded
     * @param result - Reload result object
     * @returns
     */
    static async sendReloadToChat(actor: WH40KBaseActor, weapon: WH40KItem, result: ReloadResult): Promise<ChatMessage | undefined> {
        const system = this.getWeaponSystem(weapon);
        const templateData = {
            actor: actor,
            weapon: weapon,
            result: result,
            effectiveReloadTime: this.getEffectiveReloadTime(weapon),
            baseReloadTime: system.reload,
            hasCustomised: this.hasCustomisedQuality(weapon),
            clipCurrent: system.clip.value,
            clipMax: system.effectiveClipMax,
        };

        const html = await foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/reload-action-chat.hbs', templateData);

        const chatData = {
            user: game.user.id,
            speaker: ChatMessage.getSpeaker({ actor }),
            content: html,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            flavor: `${weapon.name} - Reload`,
        };

        return ChatMessage.create(chatData) as Promise<ChatMessage | undefined>;
    }

    /**
     * Find compatible ammunition in actor inventory.
     * @param actor - The actor
     * @param weapon - The weapon
     * @returns Array of compatible ammunition items
     */
    static findSpareAmmunition(actor: WH40KBaseActor, weapon: WH40KItem): WH40KItem[] {
        if (!actor || !weapon) return [];

        const system = this.getWeaponSystem(weapon);
        const weaponType = system.type;
        const currentAmmoUuid = system.loadedAmmo?.uuid;

        // Find ammunition items compatible with this weapon type that have rounds available
        const compatible = actor.items.filter((item: WH40KItem) => {
            if (item.type !== 'ammunition') return false;
            const ammoSystem = this.getAmmoSystem(item);
            if ((ammoSystem.quantity || 0) <= 0) return false;
            const ammoWeaponTypes = ammoSystem.weaponTypes;
            // Universal ammo (empty weaponTypes set) is compatible with all weapons
            if (!ammoWeaponTypes || ammoWeaponTypes.size === 0) return true;
            return ammoWeaponTypes.has(weaponType);
        }) as WH40KItem[];

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
     * @param actor - The actor
     * @param weapon - The weapon
     * @returns
     */
    static hasSpareAmmunition(actor: WH40KBaseActor, weapon: WH40KItem): boolean {
        return this.findSpareAmmunition(actor, weapon).length > 0;
    }
}

export const DHReloadActionManager = new ReloadActionManager();
