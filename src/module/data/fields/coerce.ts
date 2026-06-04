/**
 * Integer coercion shared by DataModel migration/preparation paths (#271).
 *
 * The `null/undefined/'' → fallback; Number(x); NaN → fallback; floor` idiom was
 * re-inlined across `creature.ts`, `npc.ts`, and `npc-import-migration.ts`; this
 * is the single owner those sites delegate to.
 */

/**
 * Coerce an arbitrary value to an integer, flooring. `null` / `undefined` /
 * empty string / non-numeric all yield `fallback`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: coerceInt is the single coercion entry point for untyped pre-validation migration / source values
export function coerceInt(value: unknown, fallback = 0): number {
    if (value === null || value === undefined || value === '') return fallback;
    const num = Number(value);
    if (Number.isNaN(num)) return fallback;
    return Math.floor(num);
}
