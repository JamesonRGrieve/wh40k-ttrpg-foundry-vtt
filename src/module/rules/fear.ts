/**
 * Fear (X) trait + Fear test resolver (#65 — core.md §"Fear", p.286-287).
 *
 * Fear (X) on a creature triggers a Willpower test when an observer
 * comes face-to-face with it. The test target = WP − 10 × (X − 1),
 * where X is the Fear rating (1..4): every line prints Disturbing (1)
 * +0, Frightening (2) −10, Horrifying (3) −20 and Terrifying (4) −30.
 * Failure rolls on the Shock table (p.287).
 *
 * Composes with `rules/pinning.ts` (#111) — several Shock outcomes
 * call for Pinning.
 *
 * Pure helpers — the trait.ts schema field, the actor
 * `rollFearTest(rating)` method, and the Shock-table roll dispatch
 * are follow-up scope for #65.
 */

import { nonNegInt } from './_num.ts';

/** Maximum canonical Fear rating per RAW (Fear 4 is the highest tier). */
export const MAX_FEAR_RATING = 4;

/**
 * Clamp an arbitrary numeric input to a canonical Fear rating in
 * `[0, MAX_FEAR_RATING]`, truncating fractions and treating non-finite
 * input as 0. Single source of the Fear-range clamp so a range change
 * lands in one place (the penalty, the test target, and the Crusader
 * Smite-the-Unholy rider all route through it).
 */
export function clampFearRating(rating: number): number {
    return Math.max(0, Math.min(MAX_FEAR_RATING, Math.trunc(Number.isFinite(rating) ? rating : 0)));
}

/**
 * Per-rating WP penalty magnitude: Fear (X) imposes −10 × (X − 1) on the
 * resist test (Disturbing (1) +0 … Terrifying (4) −30). Rating 0 (no Fear)
 * is no penalty.
 */
export function getFearTestPenalty(rating: number): number {
    const clamped = clampFearRating(rating);
    return clamped === 0 ? 0 : (clamped - 1) * 10;
}

export interface FearTestInput {
    /** Observer's full Willpower characteristic total. */
    willpowerTotal: number;
    /** Source creature's Fear rating (X). 0 means no Fear trait. */
    fearRating: number;
}

export interface FearTestResult {
    /** Effective WP target for the resist test. */
    target: number;
    /** True when the rating is 0 — no test required. */
    isNoOp: boolean;
}

/** Compose the Fear-test target. RAW: target = WP − 10 × (rating − 1). */
export function resolveFearTest(input: FearTestInput): FearTestResult {
    const rating = clampFearRating(input.fearRating);
    if (rating === 0) return { target: input.willpowerTotal, isNoOp: true };
    const wp = nonNegInt(input.willpowerTotal);
    return { target: Math.max(0, wp - getFearTestPenalty(rating)), isNoOp: false };
}

/**
 * Shock-table threshold per RAW: any FAILED Fear test rolls on the
 * Shock table. The roll uses 1d100 + 10 per DoF after the first.
 * Returns the additive modifier to the 1d100 roll given the DoF count
 * (DoF 1 = +0, DoF 2 = +10, DoF 3 = +20, …).
 */
export function getShockTableRollModifier(degreesOfFailure: number): number {
    const dof = Math.max(1, Math.trunc(Number.isFinite(degreesOfFailure) ? degreesOfFailure : 1));
    return (dof - 1) * 10;
}
