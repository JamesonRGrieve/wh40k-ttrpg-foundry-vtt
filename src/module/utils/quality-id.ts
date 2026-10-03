/**
 * @file quality-id - the single parser for weapon-quality identifiers.
 *
 * Quality ids follow `<quality>-<rating>`: `blast-3`, `flamer-x`, `blast-10+1d10`,
 * or a bare `tearing`. Every consumer (labels, tooltips, attack-specials, the
 * weapon model) parses through here so the convention changes in one place.
 * Dependency-free on purpose: rules, data and UI layers all import it.
 */

/** A dice-expression rating suffix, e.g. `10+1d10`, `1d10+10`, `2d10`. */
const QUALITY_DICE_RATING = /^(?:\d+[+-]\d*d\d+|\d*d\d+(?:[+-]\d+)?)$/i;

/** A quality identifier split into its base id and its rating. */
export interface ParsedQualityId {
    baseId: string;
    /** Fixed numeric rating, or null (unrated, `(X)`, or dice-rated). */
    level: number | null;
    /** Dice-expression rating as printed (`blast-10+1d10` → `10+1d10`), else null. */
    formula: string | null;
}

/**
 * Parse a quality identifier into its base id and rating. `blast-3` → level 3;
 * `flamer-x` → level null (the `(X)` placeholder); `blast-10+1d10` → formula
 * `10+1d10` (OW's Earthshaker prints "Blast (10+1d10)"); a bare `tearing` is
 * unrated. Content-agnostic — pure suffix parsing, no quality table is consulted.
 */
export function parseQualityLevel(identifier: string): ParsedQualityId {
    const levelMatch = identifier.match(/^(.+?)-(\d+|x)$/i);
    const base = levelMatch?.[1];
    const lvl = levelMatch?.[2];
    if (base !== undefined && lvl !== undefined) {
        return { baseId: base, level: lvl.toLowerCase() === 'x' ? null : parseInt(lvl, 10), formula: null };
    }
    // The rating is the remainder after the earliest dash whose whole remainder is a
    // dice expression, so hyphenated base ids (`multi-part-2d10`) keep their dashes.
    for (let i = identifier.indexOf('-'); i !== -1; i = identifier.indexOf('-', i + 1)) {
        const rating = identifier.slice(i + 1);
        if (QUALITY_DICE_RATING.test(rating)) return { baseId: identifier.slice(0, i), level: null, formula: rating };
    }
    return { baseId: identifier, level: null, formula: null };
}

/**
 * Append the rating suffix to a localized quality label: ` (N)` for a known
 * level, ` (10+1d10)` for a dice rating, ` (X)` when the quality takes a level
 * but none was supplied, nothing otherwise.
 */
export function buildQualityLabel(localizedBase: string, hasLevel: boolean, level: number | null, formula: string | null = null): string {
    if (formula !== null) return `${localizedBase} (${formula})`;
    if (!hasLevel) return localizedBase;
    return level !== null ? `${localizedBase} (${level})` : `${localizedBase} (X)`;
}
