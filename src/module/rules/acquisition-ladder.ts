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
export type AvailabilityModifier = number | 'automatic' | 'discretion';

/** A line's printed acquisition ladder. */
export interface AcquisitionLadder {
    availability: Readonly<Record<AvailabilityKey, AvailabilityModifier>>;
    /** `null` when the line's test takes no craftsmanship modifier. */
    craftsmanship: Readonly<Record<CraftsmanshipKey, number>> | null;
}

/** How one availability cell resolves for a test. */
export type AvailabilityTerm = { kind: 'modifier'; value: number } | { kind: 'automatic' } | { kind: 'discretion' };

/** Resolve an availability rating against a ladder. */
export function availabilityTerm(ladder: AcquisitionLadder, availability: AvailabilityKey): AvailabilityTerm {
    const cell = ladder.availability[availability];
    return typeof cell === 'number' ? { kind: 'modifier', value: cell } : { kind: cell };
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
