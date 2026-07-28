/**
 * The Imperial Dating System — the canonical 40k timestamp (#487).
 *
 * Format: `C.FFF.YYY.M##` — e.g. `5.420.816.M41`, read as
 * *check 5, fraction 420, year 816, 41st millennium*.
 *
 *  - **Check number** (`C`, 0–9): how reliable the stamp is relative to Terran
 *    standard time. Class 0 is Terra itself; each step out is a further remove
 *    from direct psychic contact, with the high classes effectively "estimated".
 *    It is a *statement about the observer*, not a time value — so it never
 *    participates in arithmetic and is carried through unchanged.
 *  - **Year fraction** (`FFF`, 000–999): the Terran year divided into 1000 equal
 *    parts of 8.766 hours each (a "Makr"). This is the smallest unit the format
 *    expresses — an Imperial timestamp is inherently coarser than a clock.
 *  - **Year** (`YYY`, 000–999): the year within the millennium.
 *  - **Millennium** (`M##`): M41 spans years 40001–41000, so `816.M41` is the
 *    40,816th year.
 *
 * There is deliberately **no universal wall-clock format** here: the Imperium has
 * no shared calendar, and this module does not invent one. Everything is anchored
 * to a campaign's own inception stamp and advanced by elapsed in-universe seconds.
 *
 * Pure and Foundry-free, like `world-time.ts`, so it is unit-testable without a
 * live world. Time-of-day is intentionally NOT part of the Imperial stamp — the
 * widget renders it separately from the world clock's own components.
 */

/** Hours in a Terran standard year (365.25 days) — the basis of the fraction. */
const YEAR_HOURS = 365.25 * 24;
/** Seconds in a Terran standard year. */
const YEAR_SECONDS = YEAR_HOURS * 3600;
/** The year is divided into exactly this many fractions. */
const FRACTIONS_PER_YEAR = 1000;
/** Seconds in one year-fraction (a "Makr" — 8.766 hours). */
export const FRACTION_SECONDS = YEAR_SECONDS / FRACTIONS_PER_YEAR;

/** A parsed Imperial timestamp. */
export interface ImperialDate {
    /** Accuracy class 0–9. Carried, never computed. */
    check: number;
    /** Year fraction 0–999. */
    fraction: number;
    /** Year within the millennium, 0–999. */
    year: number;
    /** Millennium number (41 for M41). */
    millennium: number;
}

const IMPERIAL_DATE_PATTERN = /^\s*(\d)\.(\d{3})\.(\d{3})\.M(\d{1,3})\s*$/;

/**
 * Parse a canonical Imperial timestamp (`5.420.816.M41`).
 *
 * @returns the parsed date, or `null` when the string is not a well-formed stamp.
 *   Returning null rather than throwing keeps a bad world setting from taking the
 *   whole widget down — the caller falls back to its default.
 */
export function parseImperialDate(value: string): ImperialDate | null {
    const match = IMPERIAL_DATE_PATTERN.exec(value);
    if (match === null) return null;
    const [, check, fraction, year, millennium] = match;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess parser mismatch: tsconfig.test.json (ESLint's parser project) has the flag off so it types these capture-group reads as `string`, while tsconfig.json has it on and requires the guard.
    if (check === undefined || fraction === undefined || year === undefined || millennium === undefined) return null;
    const parsed: ImperialDate = {
        check: Number(check),
        fraction: Number(fraction),
        year: Number(year),
        millennium: Number(millennium),
    };
    if (parsed.millennium < 1) return null;
    return parsed;
}

/** Render an Imperial timestamp in canonical form, zero-padded (`5.420.816.M41`). */
export function formatImperialDate(date: ImperialDate): string {
    const check = Math.trunc(date.check).toString().padStart(1, '0');
    const fraction = Math.trunc(date.fraction).toString().padStart(3, '0');
    const year = Math.trunc(date.year).toString().padStart(3, '0');
    return `${check}.${fraction}.${year}.M${Math.trunc(date.millennium)}`;
}

/**
 * Absolute seconds since the start of M1 — a monotonic scalar the date arithmetic
 * can work in. Not meaningful on its own; only differences and round-trips are.
 *
 * A millennium's years run 1–1000 in-fiction (M41 = 40001–41000), so the year is
 * offset by one before scaling.
 */
export function imperialDateToAbsoluteSeconds(date: ImperialDate): number {
    const absoluteYear = (date.millennium - 1) * 1000 + date.year - 1;
    return absoluteYear * YEAR_SECONDS + date.fraction * FRACTION_SECONDS;
}

/**
 * Invert {@link imperialDateToAbsoluteSeconds}, carrying the check number through
 * unchanged (it describes the observer, not the instant).
 *
 * Fractions floor rather than round: a stamp names the fraction currently
 * elapsing, so 419.9 fractions in is still fraction 419.
 */
export function imperialDateFromAbsoluteSeconds(seconds: number, check: number): ImperialDate {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const absoluteYear = Math.floor(safeSeconds / YEAR_SECONDS);
    const withinYear = safeSeconds - absoluteYear * YEAR_SECONDS;
    const fraction = Math.min(FRACTIONS_PER_YEAR - 1, Math.floor(withinYear / FRACTION_SECONDS));
    const millennium = Math.floor(absoluteYear / 1000) + 1;
    const year = (absoluteYear % 1000) + 1;
    return { check, fraction, year: year === 1000 ? 0 : year, millennium };
}

/**
 * Advance an Imperial timestamp by elapsed in-universe seconds.
 *
 * This is how the campaign clock reads: the inception stamp plus however much
 * world time has passed since. Negative deltas are clamped at the inception
 * instant — the campaign has no dates before it began.
 */
export function addSecondsToImperialDate(date: ImperialDate, seconds: number): ImperialDate {
    const base = imperialDateToAbsoluteSeconds(date);
    const delta = Number.isFinite(seconds) ? seconds : 0;
    return imperialDateFromAbsoluteSeconds(Math.max(base, base + delta), date.check);
}
