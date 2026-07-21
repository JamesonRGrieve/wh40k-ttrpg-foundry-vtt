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

import { nonNegInt } from './_num.ts';

/** Maximum assistants the engine will count toward the bonus. */
export const DEFAULT_ASSISTANT_CAP = 2;

/** Bonus each counted assistant contributes (RAW +10 per). */
export const ASSIST_BONUS_PER_ALLY = 10;

/**
 * Returns the assistance bonus to apply to a test target.
 * Negative or non-finite counts return 0.
 */
export function getAssistanceBonus(assistants: number, cap: number = DEFAULT_ASSISTANT_CAP): number {
    if (!Number.isFinite(assistants)) return 0;
    const n = Math.min(nonNegInt(assistants), nonNegInt(cap));
    return n * ASSIST_BONUS_PER_ALLY;
}
