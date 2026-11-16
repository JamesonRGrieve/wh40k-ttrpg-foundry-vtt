/**
 * Banded d10 lookups, as origin paths print their Fate Points: "(1-5|=2),(6-9|=3),(10|=4)".
 *
 * Each band is a range of faces ("6-9") or a single face ("10") and the value it gives.
 * Pure: no Foundry, no content.
 */

/** One band of a lookup: a roll from `min` to `max` gives `value`. */
export interface RollBand {
    min: number;
    max: number;
    value: number;
}

/** A band: `(min-max|=value)` or a single face `(face|=value)`. */
const BAND_PATTERN = /\((\d+)(?:-(\d+))?\|=(\d+)\)/g;

/** The bands of a lookup formula, in order; empty when the formula has none. */
export function parseRollBands(formula: string): RollBand[] {
    // A single-face band has no upper face: it defaults to the lower one.
    return [...formula.matchAll(BAND_PATTERN)].map(([, min = '0', max = min, value = '0']) => ({
        min: parseInt(min, 10),
        max: parseInt(max, 10),
        value: parseInt(value, 10),
    }));
}

/** Whether a formula is a banded lookup at all. */
export function isRollBandFormula(formula: string): boolean {
    return parseRollBands(formula).length > 0;
}

/** The band a roll lands in, or undefined when none covers it. */
export function bandForRoll(bands: readonly RollBand[], rolled: number): RollBand | undefined {
    return bands.find((band) => rolled >= band.min && rolled <= band.max);
}

/** A band's faces as printed: "6-9", or "10" for a single face. */
export function bandRangeLabel(band: RollBand): string {
    return band.min === band.max ? String(band.min) : `${band.min}-${band.max}`;
}
