/**
 * Fear (X) trait + Fear test resolver (#65 — core.md §"Fear", p.286-287).
 *
 * Fear (X) on a creature triggers a Willpower test when an observer
 * comes face-to-face with it. The test target = WP − (10 × X), where
 * X is the Fear rating (1..4). Failure (3+ DoF on the test) rolls on
 * the Shock table (p.287).
 *
 * Composes with `rules/pinning.ts` (#111) — several Shock outcomes
 * call for Pinning.
 *
 * Pure helpers — the trait.ts schema field, the actor
 * `rollFearTest(rating)` method, and the Shock-table roll dispatch
 * are follow-up scope for #65.
 */

/** Maximum canonical Fear rating per RAW (Fear 4 is the highest tier). */
export const MAX_FEAR_RATING = 4;

/** Per-rating WP penalty: Fear (X) imposes −10 × X on the resist test. */
export function getFearTestPenalty(rating: number): number {
    const r = Math.max(0, Math.min(MAX_FEAR_RATING, Math.trunc(Number.isFinite(rating) ? rating : 0)));
    return r * 10;
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

/** Compose the Fear-test target. RAW: target = WP − (10 × rating). */
export function resolveFearTest(input: FearTestInput): FearTestResult {
    const rating = Math.max(0, Math.min(MAX_FEAR_RATING, Math.trunc(Number.isFinite(input.fearRating) ? input.fearRating : 0)));
    if (rating === 0) return { target: input.willpowerTotal, isNoOp: true };
    const wp = Math.max(0, Math.trunc(input.willpowerTotal));
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
