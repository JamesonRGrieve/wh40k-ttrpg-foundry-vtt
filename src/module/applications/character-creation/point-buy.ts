/**
 * Point-buy characteristic generation (#717): pure rules over plain data.
 *
 * Cost is a flat 1 point per +1 above the base (a content-agnostic linear
 * primitive). The builder holds the allocations and writes back the value
 * these functions return.
 */

/** The pool, the per-characteristic cap and how to read a characteristic's base. */
export interface PointBuyRules {
    /** The characteristics point-buy allocates to. */
    characteristics: readonly string[];
    /** The total points available. */
    pool: number;
    /** The highest base + points a created characteristic may reach. */
    cap: number;
    /** The base a characteristic starts from before points. */
    baseFor: (key: string) => number;
}

/** Points spent across the generated characteristics; negative stored spends count as 0. */
export function pointBuySpent(allocations: Readonly<Record<string, number>>, characteristics: readonly string[]): number {
    let spent = 0;
    for (const key of characteristics) spent += Math.max(0, allocations[key] ?? 0);
    return spent;
}

/**
 * The allocation for `key` after a signed `delta`. A positive delta stops at the
 * remaining pool and at the cap; a negative one stops at 0. A key outside the
 * generated characteristics keeps its current value.
 */
export function adjustedAllocation(rules: PointBuyRules, allocations: Readonly<Record<string, number>>, key: string, delta: number): number {
    if (!rules.characteristics.includes(key)) return allocations[key] ?? 0;
    const current = Math.max(0, allocations[key] ?? 0);
    if (delta <= 0) return Math.max(0, current + delta);
    const remaining = rules.pool - pointBuySpent(allocations, rules.characteristics);
    const capHeadroom = Math.max(0, rules.cap - rules.baseFor(key) - current);
    return current + Math.min(delta, Math.max(0, remaining), capHeadroom);
}

/**
 * The allocation for `key` when set to `value` outright: floored at 0, truncated,
 * and capped by the pool (with this characteristic's own spend refunded) and by
 * the cap. A key outside the generated characteristics keeps its current value.
 */
export function setAllocation(rules: PointBuyRules, allocations: Readonly<Record<string, number>>, key: string, value: number): number {
    if (!rules.characteristics.includes(key)) return allocations[key] ?? 0;
    const desired = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
    const current = Math.max(0, allocations[key] ?? 0);
    const poolHeadroom = rules.pool - (pointBuySpent(allocations, rules.characteristics) - current);
    const capHeadroom = rules.cap - rules.baseFor(key);
    return Math.max(0, Math.min(desired, poolHeadroom, capHeadroom));
}
