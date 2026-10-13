/**
 * The acquisition-ladder plumbing shared by every line's availability /
 * craftsmanship modifier table (#192).
 *
 * Each game line prints its own ladder (DH2 Table 5-1, RT Table 9-35, BC
 * Table 9-11, …) and the values differ between lines, so the VALUES live on
 * the line's game-system config (`BaseSystemConfig.acquisitionLadder`). This
 * module holds only the content-agnostic part: the rating keys, the ladder
 * shape, the key normalisers, and how a printed cell resolves.
 */

/** Availability ratings, from most to least available. */
export const AVAILABILITY_KEYS = [
    'ubiquitous',
    'abundant',
    'plentiful',
    'common',
    'average',
    'scarce',
    'rare',
    'veryRare',
    'extremelyRare',
    'nearUnique',
    'unique',
] as const;

export type AvailabilityKey = (typeof AVAILABILITY_KEYS)[number];

/** Craftsmanship grades, from worst to best. */
export const CRAFTSMANSHIP_KEYS = ['poor', 'common', 'good', 'best'] as const;

export type CraftsmanshipKey = (typeof CRAFTSMANSHIP_KEYS)[number];

/**
 * One printed availability cell: a modifier, or a cell the book prints with no
 * number — `automatic` (the test is passed without a roll) or `discretion`
 * (the GM decides).
 */
type AvailabilityModifier = number | 'automatic' | 'discretion';

/** One printed availability column: a cell per rating. */
export type AvailabilityColumn = Readonly<Record<AvailabilityKey, AvailabilityModifier>>;

/**
 * What a failed acquisition test costs the requester's rating, as the line
 * prints it (#496).
 * - `flat`: lose `loss` when the test fails by `minDegrees` or more, with
 *   degrees counted per `counting` — `fullTens` (one per full 10 points of
 *   margin, the DH1 rule) or `plusOne` (a bare fail is 1, the DH2-era rule).
 * - `beyondFellowshipBonus`: lose the degrees of failure in excess of the
 *   requester's Fellowship bonus (degrees counted `plusOne`).
 */
export type AcquisitionFailureLoss = { kind: 'flat'; minDegrees: number; loss: number; counting: 'fullTens' | 'plusOne' } | { kind: 'beyondFellowshipBonus' };

/** A line's printed acquisition ladder. */
export interface AcquisitionLadder {
    availability: AvailabilityColumn;
    /** `null` when the line's test takes no craftsmanship modifier. */
    craftsmanship: Readonly<Record<CraftsmanshipKey, number>> | null;
    /** What a failed test costs the rating; `null` when the line prints no loss. */
    failureLoss: AcquisitionFailureLoss | null;
}

/** How one availability cell resolves for a test. */
export type AvailabilityTerm = { kind: 'modifier'; value: number } | { kind: 'automatic' } | { kind: 'discretion' };

/** Resolve an availability rating against one printed column. */
export function availabilityCell(column: AvailabilityColumn, availability: AvailabilityKey): AvailabilityTerm {
    const cell = column[availability];
    return typeof cell === 'number' ? { kind: 'modifier', value: cell } : { kind: cell };
}

/** Resolve an availability rating against a ladder. */
export function availabilityTerm(ladder: AcquisitionLadder, availability: AvailabilityKey): AvailabilityTerm {
    return availabilityCell(ladder.availability, availability);
}

/**
 * The rating left after a FAILED acquisition test, under the line's printed
 * failure loss. `degreesOfFailure` is the `plusOne` count (a bare fail is 1),
 * which is what the requisition rail rolls with; a `fullTens` rule converts.
 * The rating never falls below 0.
 */
export function ratingAfterFailure(loss: AcquisitionFailureLoss | null, rating: number, degreesOfFailure: number, fellowshipBonus: number): number {
    const current = Math.max(0, Math.trunc(rating));
    if (loss === null || degreesOfFailure <= 0) return current;
    let lost = 0;
    if (loss.kind === 'flat') {
        const degrees = loss.counting === 'fullTens' ? degreesOfFailure - 1 : degreesOfFailure;
        lost = degrees >= loss.minDegrees ? loss.loss : 0;
    } else {
        lost = Math.max(0, degreesOfFailure - Math.max(0, Math.trunc(fellowshipBonus)));
    }
    return Math.max(0, current - lost);
}

function collapseKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '');
}

const AVAILABILITY_BY_COLLAPSED: ReadonlyMap<string, AvailabilityKey> = new Map(AVAILABILITY_KEYS.map((key) => [key.toLowerCase(), key]));

const CRAFTSMANSHIP_BY_COLLAPSED: ReadonlyMap<string, CraftsmanshipKey> = new Map(CRAFTSMANSHIP_KEYS.map((key) => [key, key]));

/**
 * Resolve a stored availability string to its key, tolerating the spellings
 * the data uses (`'very rare'`, `'Very Rare'`, `'very-rare'`, `'veryRare'`).
 * Returns null for a rating no ladder rates (e.g. `uncommon`).
 */
export function normaliseAvailability(raw: string | null | undefined): AvailabilityKey | null {
    if (raw === null || raw === undefined) return null;
    return AVAILABILITY_BY_COLLAPSED.get(collapseKey(raw)) ?? null;
}

/** Resolve a stored craftsmanship string to its key, or null. */
export function normaliseCraftsmanship(raw: string | null | undefined): CraftsmanshipKey | null {
    if (raw === null || raw === undefined) return null;
    return CRAFTSMANSHIP_BY_COLLAPSED.get(collapseKey(raw)) ?? null;
}
