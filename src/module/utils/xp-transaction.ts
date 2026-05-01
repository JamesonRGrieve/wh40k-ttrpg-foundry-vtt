/**
 * XP Transaction Utility
 *
 * Handles XP spending for character advancements.
 * Provides validation and atomic updates to actor experience.
 */

import type { WH40KBaseActorDocument } from '../types/global.d.ts';

type TransactionResult = {
    success: boolean;
    error?: string;
    newAvailable?: number;
};

type XPPurchase = {
    cost: number;
    reason: string;
};

type XPSummary = {
    total: number;
    used: number;
    available: number;
    spentOnCharacteristics: number;
    spentOnSkills: number;
    spentOnTalents: number;
    spentOnPsychicPowers: number;
};

type ExperienceLike = {
    total?: number;
    used?: number;
    spentCharacteristics?: number;
    spentSkills?: number;
    spentTalents?: number;
    spentPsychicPowers?: number;
};

/**
 * @typedef {Object} TransactionResult
 * @property {boolean} success - Whether the transaction succeeded
 * @property {string} [error] - Error message if failed
 * @property {number} [newAvailable] - New available XP after transaction
 */

/**
 * Get the available XP for an actor
 * @param {Actor} actor - The actor to check
 * @returns {number} Available XP
 */
export function getAvailableXP(actor: WH40KBaseActorDocument): number {
    const experience = actor.system?.experience;
    if (!experience) return 0;

    // Available = total - used
    return (experience.total ?? 0) - (experience.used ?? 0);
}

/**
 * Check if an actor can afford an XP cost
 * @param {Actor} actor - The actor to check
 * @param {number} cost - The XP cost
 * @returns {boolean}
 */
export function canAfford(actor: WH40KBaseActorDocument, cost: number): boolean {
    return getAvailableXP(actor) >= cost;
}

/**
 * Spend XP for an advancement
 * Updates the actor's experience.used field
 *
 * @param {Actor} actor - The actor spending XP
 * @param {number} cost - The XP cost
 * @param {string} [reason] - Optional reason for the transaction (for logging)
 * @returns {Promise<TransactionResult>}
 */
export async function spendXP(actor: WH40KBaseActorDocument, cost: number, reason = ''): Promise<TransactionResult> {
    // Validate inputs
    if (!actor) {
        return { success: false, error: 'No actor provided' };
    }

    if (cost <= 0) {
        return { success: false, error: 'Invalid cost: must be positive' };
    }

    const available = getAvailableXP(actor);

    if (available < cost) {
        return {
            success: false,
            error: game.i18n.format('WH40K.Advancement.Error.InsufficientXP', {
                cost,
                available,
            }),
        };
    }

    try {
        // Calculate new used value
        const experience = actor.system.experience as ExperienceLike | undefined;
        const currentUsed = experience?.used ?? 0;
        const newUsed = currentUsed + cost;

        // Update the actor
        await actor.update({
            'system.experience.used': newUsed,
        });

        // Log the transaction
        if (reason) {
            console.log(`XP Transaction: ${actor.name} spent ${cost} XP on ${reason}. Available: ${available - cost}`);
        }

        return {
            success: true,
            newAvailable: available - cost,
        };
    } catch (error) {
        console.error('XP Transaction failed:', error);
        return {
            success: false,
            error: game.i18n.localize('WH40K.Advancement.Error.TransactionFailed'),
        };
    }
}

/**
 * Batch spend XP for multiple purchases
 * All purchases succeed or all fail (atomic)
 *
 * @param {Actor} actor - The actor spending XP
 * @param {Array<{cost: number, reason: string}>} purchases - Array of purchases
 * @returns {Promise<TransactionResult>}
 */
export async function spendXPBatch(actor: WH40KBaseActorDocument, purchases: XPPurchase[]): Promise<TransactionResult> {
    if (!actor || !purchases?.length) {
        return { success: false, error: 'Invalid arguments' };
    }

    // Calculate total cost
    const totalCost = purchases.reduce((sum, p) => sum + (p.cost ?? 0), 0);
    const available = getAvailableXP(actor);

    if (available < totalCost) {
        return {
            success: false,
            error: game.i18n.format('WH40K.Advancement.Error.InsufficientXP', {
                cost: totalCost,
                available,
            }),
        };
    }

    try {
        const experience = actor.system.experience as ExperienceLike | undefined;
        const currentUsed = experience?.used ?? 0;
        const newUsed = currentUsed + totalCost;

        await actor.update({
            'system.experience.used': newUsed,
        });

        // Log all purchases
        const reasons = purchases
            .map((p: XPPurchase) => p.reason)
            .filter(Boolean)
            .join(', ');
        console.log(`XP Batch Transaction: ${actor.name} spent ${totalCost} XP on [${reasons}]. Available: ${available - totalCost}`);

        return {
            success: true,
            newAvailable: available - totalCost,
        };
    } catch (error) {
        console.error('XP Batch Transaction failed:', error);
        return {
            success: false,
            error: game.i18n.localize('WH40K.Advancement.Error.TransactionFailed'),
        };
    }
}

/**
 * Get XP spending summary for an actor
 * @param {Actor} actor - The actor to check
 * @returns {Object} Summary of XP allocation
 */
export function getXPSummary(actor: WH40KBaseActorDocument): XPSummary {
    const exp = (actor.system?.experience as ExperienceLike | undefined) ?? {};

    return {
        total: exp.total ?? 0,
        used: exp.used ?? 0,
        available: getAvailableXP(actor),
        spentOnCharacteristics: exp.spentCharacteristics ?? 0,
        spentOnSkills: exp.spentSkills ?? 0,
        spentOnTalents: exp.spentTalents ?? 0,
        spentOnPsychicPowers: exp.spentPsychicPowers ?? 0,
    };
}

/**
 * Calculate the total XP cost of a list of advancements
 * @param {Array<{cost: number}>} advancements - List of advancements
 * @returns {number} Total cost
 */
export function calculateTotalCost(advancements: Array<{ cost: number }>): number {
    if (!advancements?.length) return 0;
    return advancements.reduce((sum: number, adv: { cost: number }) => sum + (adv.cost ?? 0), 0);
}
