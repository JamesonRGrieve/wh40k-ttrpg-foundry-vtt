/**
 * Malignancy Test (core.md §"The Malignancy Test", p. 290).
 *
 * Triggered at corruption thresholds (every 10 CP gained). The actor
 * rolls a d100 against Willpower; failure means rolling on the
 * Malignancy table and gaining an embedded malignancy item.
 *
 * Threshold-crossing detection is the caller's job; this module just
 * tells you whether a given (oldCP, newCP) pair crossed a multiple of
 * 10 and, if so, the target value for the test.
 */

/** Returns the number of malignancy-test thresholds crossed between old → new. */
export function malignancyThresholdsCrossed(oldCorruption: number, newCorruption: number): number {
    const a = Math.max(0, Math.trunc(oldCorruption));
    const b = Math.max(0, Math.trunc(newCorruption));
    if (b <= a) return 0;
    return Math.floor(b / 10) - Math.floor(a / 10);
}

/**
 * Returns the Willpower-test target for a Malignancy Test. RAW p. 290:
 * test is straight WP, modified by total Corruption (−10 per 10 CP).
 *
 * @param willpowerTotal effective WP characteristic total.
 * @param corruption current Corruption Points.
 */
export function getMalignancyTestTarget(willpowerTotal: number, corruption: number): number {
    const wp = Math.max(0, Math.trunc(willpowerTotal));
    const corr = Math.max(0, Math.trunc(corruption));
    const penalty = Math.floor(corr / 10) * 10;
    return Math.max(0, wp - penalty);
}
