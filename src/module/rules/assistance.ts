/**
 * Assistance modifier (core.md §"Assistance", p. 25).
 *
 * RAW:
 *  - Up to two assistants on a single test (GM may waive for "right an
 *    overturned vehicle"-style group efforts).
 *  - Each assistant grants +10 to the active character's test.
 *  - Cannot stack on Reactions, Free Actions, or resist-tests
 *    (disease / poison / Fear) — the engine cannot detect this
 *    automatically; the GM is responsible for refusing to apply.
 *
 * This helper does the bounded math; the dialog decides whether the
 * +10 / +20 is appropriate to surface at all.
 */

/** Maximum assistants the engine will count toward the bonus. */
export const DEFAULT_ASSISTANT_CAP = 2;

/**
 * Returns the assistance bonus to apply to a test target.
 * Negative or non-finite counts return 0.
 */
export function getAssistanceBonus(assistants: number, cap: number = DEFAULT_ASSISTANT_CAP): number {
    if (!Number.isFinite(assistants)) return 0;
    const n = Math.max(0, Math.min(Math.trunc(assistants), Math.max(0, Math.trunc(cap))));
    return n * 10;
}
