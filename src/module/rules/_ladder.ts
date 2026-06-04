/**
 * Ordered-ladder primitives for the `rules/` layer (#301).
 *
 * Several rules model a value that moves up or down an ordered list of named
 * steps (renown ranks, addiction severities, condition tracks) and clamp at the
 * ends. The index-find / step / clamp and the rank-comparison were re-derived
 * per file; these are the shared cores. The ladder `order` array is the single
 * source of truth for both the sequence and the clamp bounds.
 */

/**
 * Step `current` `delta` places along the ordered `order` ladder, clamped to
 * the ends. A positive `delta` moves toward the end of the array, negative
 * toward the start. If `current` is not in `order` it is returned unchanged
 * (the caller's value is out of band — do not guess a step).
 */
export function stepLadder<T>(order: readonly T[], current: T, delta: number): T {
    const index = order.indexOf(current);
    if (index < 0) return current;
    const clamped = Math.min(order.length - 1, Math.max(0, index + delta));
    // order[clamped] is in-bounds (clamped ∈ [0, length-1]) given a non-empty
    // ladder; indexOf having succeeded guarantees length ≥ 1.
    return order[clamped] ?? current;
}

/**
 * Compare two ladder steps by position: `-1` when `a` ranks below `b`, `1` when
 * above, `0` when equal (or either is absent from `order`). Use for ≥ / ≤
 * gates between named ranks.
 */
export function compareLadder<T>(order: readonly T[], a: T, b: T): -1 | 0 | 1 {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia < 0 || ib < 0 || ia === ib) return 0;
    return ia < ib ? -1 : 1;
}
