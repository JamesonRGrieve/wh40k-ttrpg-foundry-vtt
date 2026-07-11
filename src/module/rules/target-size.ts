/**
 * Target-size to-hit modifier — the single source of truth for DH2 Table 4-6
 * (p.138), shared across the FFG-family d100 lines.
 *
 * The size→to-hit rule is `(size − 4) × 10`: every size step away from Average
 * (4) shifts the attack test by ±10, from Minuscule (1 → −30) to Titanic
 * (10 → +60). Both the auto-modifier in `rolls/roll-data.ts` and the size rows
 * in `rules/combat-circumstance-modifiers.ts` derive from this function so the
 * formula and its RAW range are defined exactly once and can never diverge
 * (#421). The ±60 roll-modifier cap is a separate concern and lives in
 * `rolls/aggregate-target.ts:clampModifierToCap`.
 */

/** Smallest RAW-enumerated creature size (Minuscule). */
export const MIN_SIZE = 1;

/** Largest RAW-enumerated creature size (Titanic). */
export const MAX_SIZE = 10;

/** The size whose to-hit modifier is 0 (Average). */
const AVERAGE_SIZE = 4;

/** To-hit shift per size step away from Average. */
const MODIFIER_PER_SIZE_STEP = 10;

/**
 * To-hit modifier for attacking a target of the given creature size.
 *
 * Computes `(size − 4) × 10`, with `size` first clamped to the RAW-enumerated
 * range [{@link MIN_SIZE}, {@link MAX_SIZE}] so an out-of-range input saturates
 * at Minuscule (−30) or Titanic (+60) rather than producing a modifier with no
 * printed size behind it. A non-numeric input (`NaN`) propagates as `NaN`,
 * matching the pre-SSOT behaviour of the call sites.
 */
export function targetSizeModifier(size: number): number {
    const clamped = Math.min(Math.max(size, MIN_SIZE), MAX_SIZE);
    return (clamped - AVERAGE_SIZE) * MODIFIER_PER_SIZE_STEP;
}
