/**
 * Pure XP-cost formulas (DH2 RAW), shared between the Advancement Dialog —
 * which charges these when a player purchases an advance — and the character
 * DataModel, which DERIVES total experience spent from the actor's current
 * state (purchased ranks / owned items / rating). Keeping the math in one
 * place means "what was charged" and "what is counted as spent" can never
 * drift. See #240 / #224.
 *
 * These are content-agnostic mechanics (pure arithmetic), not per-item content
 * values, so they live in `src/module/rules/` rather than a compendium.
 */

/**
 * Cost to advance Psy Rating from N to N+1. DH2 RAW: (N+1) × 200, where the
 * argument is the *target* rating (so the first rank, 0 → 1, costs 200).
 */
export function psyRatingStepCost(nextRating: number): number {
    return nextRating * 200;
}

/**
 * Total XP spent to reach Psy Rating `rating` from 0 — the sum of every step
 * cost Σ_{n=1..rating} (n × 200) = 100 · rating · (rating + 1).
 */
export function psyRatingTotalCost(rating: number): number {
    const r = Math.max(0, Math.floor(rating));
    return 100 * r * (r + 1);
}

/**
 * Heuristic XP cost of learning a psychic power. DH2 core powers range
 * 100–600 XP; the cost scales with the power's PR requirement (`prCost`),
 * floored at 100. Mirrors the Advancement Dialog's per-power charge so derived
 * spend matches what was paid.
 */
export function psychicPowerCost(prCost: number): number {
    const pr = Number.isFinite(prCost) && prCost > 0 ? prCost : 1;
    return Math.max(100, 200 * pr);
}
