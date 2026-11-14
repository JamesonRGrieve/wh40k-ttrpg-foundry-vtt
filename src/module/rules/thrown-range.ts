/**
 * Thrown-weapon range from a characteristic bonus of the thrower (#604).
 *
 * Every line's weapon tables print a muscle-powered weapon's Range as a multiple
 * of the wielder's Strength Bonus — `SBx3` for knives, axes, spears and grenades
 * — and every line measures Range in metres of accurate fire. DH1's rules say
 * so outright: a thrown weapon's range follows the thrower's modified Strength
 * Bonus. The multiple is pack content (the
 * weapon's `attack.range.special`, or an NPC weapon's printed `range` string);
 * this module reads the printed `<X>Bx<N>` form and multiplies. Strength's bonus
 * is the usual one; any characteristic's bonus is read the same way.
 *
 * Low / high gravity changes the Strength Bonus a character throws with (±2,
 * high: to a minimum of 0); the caller passes the already-shifted bonus from
 * `environmentThrowStrengthBonus` so the gravity rule stays in one place. Gravity
 * shifts Strength's bonus only; another characteristic's bonus is used as is.
 */
import { CHARACTERISTIC_SHORT_TO_FULL } from '../data/shared/characteristics.ts';

/**
 * `SBx3`, `SB x 4`, `SB×3`, `WPBx5m`, `TB x 2`: a characteristic's short code, `B`
 * for Bonus, then the multiple.
 */
const BONUS_RANGE = /^\s*([A-Za-z]{1,3})B\s*[x×]\s*(\d+)\s*m?\b/u;

/** Short codes, lower-cased, to the characteristic schema key. */
const SHORT_KEYS: ReadonlyMap<string, string> = new Map(Object.entries(CHARACTERISTIC_SHORT_TO_FULL).map(([short, key]) => [short.toLowerCase(), key]));

/** A printed range that is a multiple of a characteristic bonus. */
export interface BonusRange {
    /** The characteristic whose bonus the range multiplies (`strength` for `SBx3`). */
    readonly characteristic: string;
    readonly factor: number;
}

/**
 * The characteristic bonus a printed range multiplies, and by how much, or null
 * when the range is not bonus-based (a flat number, a band, `Thrown 3m`, blank).
 * Any characteristic's bonus counts, not only Strength's (operator ruling
 * 2026-11-14).
 */
export function characteristicBonusRange(printed: string | number | null | undefined): BonusRange | null {
    if (typeof printed !== 'string') return null;
    const match = BONUS_RANGE.exec(printed);
    const short = match?.at(1);
    const characteristic = short === undefined ? undefined : SHORT_KEYS.get(short.toLowerCase());
    if (characteristic === undefined) return null;
    const factor = Number(match?.at(2));
    return Number.isFinite(factor) && factor > 0 ? { characteristic, factor } : null;
}

/** A thrown range in metres: the multiple times the (non-negative) bonus. */
export function thrownRangeMetres(factor: number, bonus: number): number {
    return factor * Math.max(0, Math.trunc(bonus));
}
