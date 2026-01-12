/**
 * Encumbrance calculation utilities for character actors.
 * Extracts weight/carry capacity logic from the main actor document.
 */

/**
 * Encumbrance lookup table (S+T bonus -> carry capacity in kg)
 * Index corresponds to S+T bonus value (0-20)
 */
const ENCUMBRANCE_TABLE = [
    0.9, 2.25, 4.5, 9, 18, 27, 36, 45, 56, 67,
    78, 90, 112, 225, 337, 450, 675, 900, 1350, 1800, 2250
];

/**
 * Computes encumbrance from carried items on an actor.
 * Handles backpack/combat vest logic and calculates current vs max weight.
 * Items in ship storage are excluded from weight calculations.
 * 
 * @param {Actor} actor - The actor to compute encumbrance for
 * @returns {object} Encumbrance data with current, max, and encumbered flags
 */
export function computeEncumbrance(actor) {
    let currentWeight = 0;
    let backpackWeight = 0;
    const backpack = actor.system.backpack;
    const backpackMax = backpack?.hasBackpack ? (backpack.weight?.max ?? 0) : 0;

    // Filter out storage location items and ship-stowed items
    const carriedItems = actor.items.filter((item) => {
        if (item.isStorageLocation) return false;
        if (item.system?.inShipStorage === true) return false;
        return true;
    });

    if (backpack?.hasBackpack) {
        for (const item of carriedItems) {
            if (item.system?.inBackpack) {
                backpackWeight += item.totalWeight ?? 0;
            } else {
                currentWeight += item.totalWeight ?? 0;
            }
        }
        // Combat vest adds backpack weight to current (no separate carry)
        if (backpack.isCombatVest) {
            currentWeight += backpackWeight;
        }
    } else {
        for (const item of carriedItems) {
            currentWeight += item.totalWeight ?? 0;
        }
    }

    // Calculate max carry capacity from S+T bonus using lookup table
    const strengthBonus = Number(actor.characteristics?.strength?.bonus ?? 0);
    const toughnessBonus = Number(actor.characteristics?.toughness?.bonus ?? 0);
    const attrBonus = Math.max(0, Math.min(strengthBonus + toughnessBonus, ENCUMBRANCE_TABLE.length - 1));
    const maxWeight = ENCUMBRANCE_TABLE[attrBonus] ?? ENCUMBRANCE_TABLE[ENCUMBRANCE_TABLE.length - 1];

    // Round weights to 2 decimal places for display
    currentWeight = Math.round(currentWeight * 100) / 100;
    backpackWeight = Math.round(backpackWeight * 100) / 100;

    return {
        max: maxWeight,
        value: currentWeight,
        current: currentWeight, // Alias for compatibility
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
export function getCarryCapacity(bonus) {
    const index = Math.max(0, Math.min(bonus, ENCUMBRANCE_TABLE.length - 1));
    return ENCUMBRANCE_TABLE[index];
}

export { ENCUMBRANCE_TABLE };
