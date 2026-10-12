/**
 * @file Fate — the actor's Fate total and current points (#42).
 *
 * Every line models Fate as a total plus a current pool: the schema's
 * `fate.max` is the total (DH2's "Fate threshold"), `fate.value` the points
 * left to spend. Burning Fate permanently lowers the total:
 * - DH2 core p. 293: "Burning Fate permanently reduces the Acolyte's Fate
 *   threshold by 1, and he immediately loses any Fate points in excess of his
 *   new threshold." It may be burnt even with no points left.
 * - DH1 core ("permanently reduce their Fate Points by 1", even after spending
 *   them all), DW core ("permanently reduce his Fate Points by one") and OW core
 *   ("permanently reducing his maximum Fate Points by one") say the same.
 */

import { nonNegInt } from './_num.ts';

/** The actor's Fate fields. */
export interface FateState {
    max: number;
    value: number;
}

/** The update that burns one point of Fate (a type literal, so it is an `actor.update` payload). */
export type BurnFateUpdate = {
    'system.fate.max': number;
    'system.fate.value': number;
};

/**
 * Burn one Fate: the total drops by 1 and the current points are cut to the
 * new total. `null` when there is no Fate left to burn.
 */
export function burnFateUpdate(fate: FateState): BurnFateUpdate | null {
    const max = nonNegInt(fate.max);
    if (max <= 0) return null;
    const newMax = max - 1;
    return { 'system.fate.max': newMax, 'system.fate.value': Math.min(nonNegInt(fate.value), newMax) };
}
