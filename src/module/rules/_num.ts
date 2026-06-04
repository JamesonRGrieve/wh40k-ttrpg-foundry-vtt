/**
 * Shared numeric guards for the `rules/` layer (#301).
 *
 * The `Number.isFinite → Math.trunc → clamp-at-0` pattern was copied verbatim
 * into a private `sanitise*`/`clamp*` helper in many rule modules. These are the
 * single source of truth; domain modules import them instead of re-deriving.
 */

/**
 * Coerce to a non-negative integer: non-finite input (`NaN`, `±Infinity`)
 * becomes 0, fractions truncate toward zero, and negatives clamp to 0.
 */
export function nonNegInt(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
}

/**
 * Coerce to a non-negative finite number, preserving fractions: non-finite
 * input becomes 0 and negatives clamp to 0. Use for distances / rates that may
 * legitimately be fractional, where {@link nonNegInt} would lose precision.
 */
export function nonNegFinite(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
}

/**
 * Alias of {@link nonNegFinite} for distance-like quantities, named at the call
 * site for readability (movement ranges, throw distances, …).
 */
export function nonNegDistance(value: number): number {
    return nonNegFinite(value);
}
