/**
 * Thrown-weapon range from the thrower's Strength Bonus (#604).
 *
 * Every line's weapon tables print a muscle-powered weapon's Range as a multiple
 * of the wielder's Strength Bonus — `SBx3` for knives, axes, spears and grenades
 * — and every line defines Range as "how far the weapon can be accurately fired
 * in metres". DH1's core rules state it outright: "ranges for these weapons are
 * determined by your modified Strength Bonus". The multiple is pack content (the
 * weapon's `attack.range.special`, or an NPC weapon's printed `range` string);
 * this module only reads the printed `SBx<N>` form and multiplies.
 *
 * Low / high gravity changes the Strength Bonus a character throws with (±2,
 * high: to a minimum of 0); the caller passes the already-shifted bonus from
 * `environmentThrowStrengthBonus` so the gravity rule stays in one place.
 */

/** `SBx3`, `SB x 4`, `SB×3`, `SBx1m (when thrown)` — the printed Strength-Bonus range. */
const STRENGTH_BONUS_RANGE = /^\s*SB\s*[x×]\s*(\d+)\s*m?\b/i;

/**
 * The Strength Bonus multiple a printed range names, or null when the range is
 * not Strength-Bonus based (a flat number, a band, `Thrown 3m`, blank).
 */
export function strengthBonusRangeFactor(printed: string | number | null | undefined): number | null {
    if (typeof printed !== 'string') return null;
    const match = STRENGTH_BONUS_RANGE.exec(printed);
    if (match === null) return null;
    const factor = Number(match[1]);
    return Number.isFinite(factor) && factor > 0 ? factor : null;
}

/** A thrown range in metres: the multiple times the (non-negative) Strength Bonus. */
export function thrownRangeMetres(factor: number, strengthBonus: number): number {
    return factor * Math.max(0, Math.trunc(strengthBonus));
}
