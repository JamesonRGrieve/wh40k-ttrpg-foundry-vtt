/**
 * Malignancy Test (DH2 core rules; the same rule and Corruption Track appear
 * in the DH1, OW and RT core rules).
 *
 * For every 10 total Corruption Points a character gains, they make a
 * Willpower test modified by their place on the Corruption Track. Failure means rolling on the Malignancies table.
 *
 * The caller detects the gain (`malignancyThresholdsCrossed`) and owns the
 * roll and the chat card; this module is the arithmetic.
 */

import { nonNegInt } from './_num.ts';

/** Corruption Points between consecutive Malignancy Tests. */
const MALIGNANCY_TEST_INTERVAL = 10;

/**
 * The Corruption Track — the inclusive upper CP bound of each
 * degree and its Malignancy Test modifier. Above the last band the character
 * is Damned (removed from play); the Profane modifier is the floor.
 */
const CORRUPTION_TRACK: ReadonlyArray<readonly [maxCorruption: number, modifier: number]> = [
    [30, 0],
    [60, -10],
    [90, -20],
    [99, -30],
];
const DAMNED_MODIFIER = -30;

/** Corruption total at which the character is Damned and removed from play. */
export const DAMNED_CORRUPTION = 100;

/** Returns the number of malignancy-test thresholds crossed between old → new. */
export function malignancyThresholdsCrossed(oldCorruption: number, newCorruption: number): number {
    const a = nonNegInt(oldCorruption);
    const b = nonNegInt(newCorruption);
    if (b <= a) return 0;
    return Math.floor(b / MALIGNANCY_TEST_INTERVAL) - Math.floor(a / MALIGNANCY_TEST_INTERVAL);
}

/**
 * The queued-test count after a Corruption change: every 10-CP threshold the
 * gain crosses queues one more Malignancy Test. A loss queues nothing and never
 * cancels a test already owed.
 */
export function malignancyTestsQueued(pending: number, oldCorruption: number, newCorruption: number): number {
    return nonNegInt(pending) + malignancyThresholdsCrossed(oldCorruption, newCorruption);
}

/**
 * The Malignancy Test modifier for a Corruption total (the Corruption Track): +0
 * Tainted (≤30), −10 Soiled (31–60), −20 Debased (61–90), −30 Profane (91–99).
 */
export function corruptionTrackModifier(corruption: number): number {
    const cp = nonNegInt(corruption);
    for (const [max, modifier] of CORRUPTION_TRACK) {
        if (cp <= max) return modifier;
    }
    return DAMNED_MODIFIER;
}

/**
 * Returns the Willpower-test target for a Malignancy Test: Willpower plus the
 * Corruption Track modifier for the character's current Corruption.
 *
 * @param willpowerTotal effective WP characteristic total.
 * @param corruption current Corruption Points.
 */
export function getMalignancyTestTarget(willpowerTotal: number, corruption: number): number {
    return Math.max(0, nonNegInt(willpowerTotal) + corruptionTrackModifier(corruption));
}
