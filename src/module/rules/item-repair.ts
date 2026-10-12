/**
 * Repairing damaged items with Tech-Use (#444, DH2 core p. 142).
 *
 * "To repair a damaged item, the character makes a Tech-Use test and applies
 * the repair modifier from Table 5–2: Craftsmanship, Requisition, and Repair
 * that corresponds with the craftsmanship level for the item. If the test
 * fails with four or more degrees of failure, the item is destroyed and no
 * further repair attempts are possible."
 *
 * The printed values live on the line's game-system config
 * (`BaseSystemConfig.itemRepair`). A line whose book prints no such rule
 * declares `null`, and its Tech-Use Repair stays a plain test at the GM's
 * difficulty. This module holds only the content-agnostic math.
 */

import { nonNegInt } from './_num.ts';
import { type CraftsmanshipKey, normaliseCraftsmanship } from './acquisition-ladder.ts';
import type { XenosRepairRules } from './xenos-equipment.ts';

/** A line's printed item-repair rule. */
export interface ItemRepairRules {
    /** Repair modifier by craftsmanship (DH2 Table 5–2). */
    craftsmanship: Readonly<Record<CraftsmanshipKey, number>>;
    /** A failed repair with at least this many degrees of failure destroys the item. */
    destroyedAtDegreesOfFailure: number;
    /** The line's xenos-equipment repair rule (DH2 Enemies Without p. 42), or null. */
    xenos: XenosRepairRules | null;
}

/** The Table 5–2 repair modifier for an item's stored craftsmanship. Unknown grades count as Common (0). */
export function craftsmanshipRepairModifier(rules: ItemRepairRules, craftsmanship: string | null | undefined): number {
    const key = normaliseCraftsmanship(craftsmanship);
    return key === null ? 0 : rules.craftsmanship[key];
}

/** Whether a resolved repair test destroyed the item: a failure by the printed degrees or more. */
export function repairDestroysItem(rules: ItemRepairRules, success: boolean, degreesOfFailure: number): boolean {
    return !success && nonNegInt(degreesOfFailure) >= rules.destroyedAtDegreesOfFailure;
}
