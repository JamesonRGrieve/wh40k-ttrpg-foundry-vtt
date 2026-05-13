/**
 * Encumbrance calculation utilities for character actors.
 * Extracts weight/carry capacity logic from the main actor document.
 */

import type { WH40KBaseActorDocument } from '../types/global.d.ts';

type BackpackLike = {
    hasBackpack: boolean;
    isCombatVest: boolean;
    weight: {
        max: number;
    };
};

/**
 * Encumbrance lookup table (S+T bonus -> carry capacity in kg)
 * Index corresponds to S+T bonus value (0-20)
 */
const ENCUMBRANCE_TABLE = [0.9, 2.25, 4.5, 9, 18, 27, 36, 45, 56, 67, 78, 90, 112, 225, 337, 450, 675, 900, 1350, 1800, 2250];

/**
 * Computes encumbrance from carried items on an actor.
 * Handles backpack/combat vest logic and calculates current vs max weight.
 * Items in ship storage are excluded from weight calculations.
 *
 * @param {Actor} actor - The actor to compute encumbrance for
 * @returns {object} Encumbrance data with current, max, and encumbered flags
 */
export function computeEncumbrance(actor: WH40KBaseActorDocument): {
    max: number;
    value: number;
    encumbered: boolean;
    backpack_max: number;
    backpack_value: number;
    backpack_encumbered: boolean;
} {
    let currentWeight = 0;
    let backpackWeight = 0;
    const backpack = actor.system.backpack as BackpackLike | undefined;
    const backpackMax = backpack?.hasBackpack === true ? backpack.weight.max : 0;

    // Filter out storage location items and ship-stowed items
    const carriedItems = actor.items.filter((item) => {
        if (item.isStorageLocation) return false;
        // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
        if ((item.system as Record<string, unknown> | undefined)?.['inShipStorage'] === true) return false;
        return true;
    });

    if (backpack?.hasBackpack === true) {
        for (const item of carriedItems) {
            // eslint-disable-next-line no-restricted-syntax -- boundary: item.system is untyped Foundry data
            if ((item.system as Record<string, unknown> | undefined)?.['inBackpack'] === true) {
                backpackWeight += item.totalWeight;
            } else {
                currentWeight += item.totalWeight;
            }
        }
        // Combat vest adds backpack weight to current (no separate carry)
        if (backpack.isCombatVest) {
            currentWeight += backpackWeight;
        }
    } else {
        for (const item of carriedItems) {
            currentWeight += item.totalWeight;
        }
    }

    // Calculate max carry capacity from S+T bonus using lookup table
    const strengthBonus = Number((actor.characteristics['strength'] as (typeof actor.characteristics)[string] | undefined)?.bonus ?? 0);
    const toughnessBonus = Number((actor.characteristics['toughness'] as (typeof actor.characteristics)[string] | undefined)?.bonus ?? 0);
    const attrBonus = Math.max(0, Math.min(strengthBonus + toughnessBonus, ENCUMBRANCE_TABLE.length - 1));
    const maxWeight = (ENCUMBRANCE_TABLE[attrBonus] as number | undefined) ?? 0;

    // Round weights to 2 decimal places for display
    currentWeight = Math.round(currentWeight * 100) / 100;
    backpackWeight = Math.round(backpackWeight * 100) / 100;

    return {
        max: maxWeight,
        value: currentWeight,
        encumbered: currentWeight > maxWeight,
        backpack_max: backpackMax,
        backpack_value: backpackWeight,
        backpack_encumbered: backpackWeight > backpackMax,
    };
}

/**
 * Gets the carry capacity for a given S+T bonus.
 * @param {number} bonus - Combined Strength + Toughness bonus
 * @returns {number} Maximum carry capacity in kg
 */
export function getCarryCapacity(bonus: number): number {
    const index = Math.max(0, Math.min(bonus, ENCUMBRANCE_TABLE.length - 1));
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- noUncheckedIndexedAccess guard for strict tsconfig
    return (ENCUMBRANCE_TABLE[index] as number | undefined) ?? 0;
}

export { ENCUMBRANCE_TABLE };
