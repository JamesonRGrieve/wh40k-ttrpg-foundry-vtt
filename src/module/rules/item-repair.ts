/**
 * Repairing damaged items with Tech-Use (#444).
 *
 * A repair is a Tech-Use test modified by the item's craftsmanship. Failing
 * by four or more degrees destroys the item for good.
 *
 * The line's values live on its game-system config
 * (`BaseSystemConfig.itemRepair`). A line without this rule
 * declares `null`, and its Tech-Use Repair stays a plain test at the GM's
 * difficulty. This module holds only the content-agnostic math.
 */

import { nonNegInt } from './_num.ts';
import { type CraftsmanshipKey, normaliseCraftsmanship } from './acquisition-ladder.ts';
import type { XenosRepairRules } from './xenos-equipment.ts';

/** A line's printed item-repair rule. */
export interface ItemRepairRules {
    /** Repair modifier by craftsmanship (DH2 rules). */
    craftsmanship: Readonly<Record<CraftsmanshipKey, number>>;
    /** A failed repair with at least this many degrees of failure destroys the item. */
    destroyedAtDegreesOfFailure: number;
    /** The line's xenos-equipment repair rule (a DH2 supplement), or null. */
    xenos: XenosRepairRules | null;
}

/** The craftsmanship repair modifier for an item's stored craftsmanship. Unknown grades count as Common (0). */
export function craftsmanshipRepairModifier(rules: ItemRepairRules, craftsmanship: string | null | undefined): number {
    const key = normaliseCraftsmanship(craftsmanship);
    return key === null ? 0 : rules.craftsmanship[key];
}

/** Whether a resolved repair test destroyed the item: a failure by the printed degrees or more. */
export function repairDestroysItem(rules: ItemRepairRules, success: boolean, degreesOfFailure: number): boolean {
    return !success && nonNegInt(degreesOfFailure) >= rules.destroyedAtDegreesOfFailure;
}
