/**
 * Pure movement math shared by `CreatureTemplate` (PC path) and `NPCData` (#271).
 * Both derive half/full/charge/run from `agilityBonus + size - 4`; only the NPC
 * minimum floors (1/2/3/6) differed.
 */

/** The four movement rates derived from agility bonus + size. */
export interface MovementRates {
    half: number;
    full: number;
    charge: number;
    run: number;
}

/**
 * Compute half/full/charge/run from agility bonus + size. When `applyFloors` is
 * true (NPCs) the rates are clamped to the 1/2/3/6 minimums; PCs pass `false`
 * for the raw values.
 */
export function computeMovement(agilityBonus: number, size: number, applyFloors: boolean): MovementRates {
    const baseMove = agilityBonus + size - 4;
    if (applyFloors) {
        return {
            half: Math.max(1, baseMove),
            full: Math.max(2, baseMove * 2),
            charge: Math.max(3, baseMove * 3),
            run: Math.max(6, baseMove * 6),
        };
    }
    return { half: baseMove, full: baseMove * 2, charge: baseMove * 3, run: baseMove * 6 };
}
