/**
 * @file Spreading a burst's hits across targets (#513).
 *
 * DH2 core ch. VII, Semi-Auto Burst (Full Auto Burst is worded identically):
 *
 *   "Extra hits can either be allocated to the original target or any other
 *    targets within two metres, provided none of the new targets would have been
 *    harder to hit than the original target. If extra hits are allocated to the
 *    same target, use Table 7-2: Multiple Hits above to determine the extra Hit
 *    Locations."
 *
 * Two rules live here, and they interact:
 *
 *   1. The FIRST hit always strikes the declared target — only hits after it may
 *      be moved.
 *   2. Table 7-2 is walked PER TARGET. A hit moved onto a second target is that
 *      target's first hit and starts its sequence over; it does not inherit the
 *      original target's position in the walk. Getting this wrong is the
 *      difference between "three hits to the body" and "a hit each on three
 *      people".
 *
 * Suppressing Fire allocates differently — "the GM assigns the hit to a random
 * target within the kill zone, with every extra two degrees of success scoring
 * an extra hit against another random victim" — so it supplies its own ordering
 * rather than an attacker-chosen one.
 *
 * Pure: no Foundry globals, no document reads, no RNG. The caller supplies the
 * eligible targets (already filtered for the 2 m radius and the
 * not-harder-to-hit constraint) and the order to fill them in.
 */

/** A target a hit can land on. `id` is whatever the caller uses to identify it. */
export interface AllocationTarget {
    readonly id: string;
    readonly name: string;
}

/** One hit, attributed to a target and carrying its index within that target's own sequence. */
export interface AllocatedHit {
    /** The target this hit lands on. */
    readonly target: AllocationTarget;
    /**
     * This hit's ordinal WITHIN ITS OWN TARGET, zero-based. Table 7-2 is indexed
     * by this, not by the hit's position in the burst — the fourth hit of a burst
     * that is the first to land on a second target is that target's hit 0.
     */
    readonly hitIndexForTarget: number;
}

/** How the extra hits are spread once the first has struck the declared target. */
export type AllocationStrategy =
    /** Everything on the declared target (the single-target default). */
    | 'original'
    /** Deal round-robin across the supplied targets, in order. */
    | 'spread';

/** Inputs to {@link allocateHits}. */
export interface AllocationInput {
    /** How many hits the attack scored, after the rate-of-fire ceiling. */
    readonly hitCount: number;
    /** The declared target. Always takes the first hit. */
    readonly originalTarget: AllocationTarget;
    /**
     * Further targets the extra hits may be moved onto, in the order the caller
     * wants them filled. Already filtered for the 2 m radius and the
     * not-harder-to-hit constraint — this module does not know about positions.
     */
    readonly extraTargets: readonly AllocationTarget[];
    readonly strategy: AllocationStrategy;
}

/**
 * Attribute each hit of a burst to a target, numbering it within that target.
 *
 * The first hit always lands on `originalTarget`. Under `'original'` — or when
 * there are no other eligible targets — every remaining hit lands there too, so
 * the single-target case is unchanged.
 * @param {AllocationInput} input  Hit count, the declared target, the eligible extras, and the strategy.
 * @returns {AllocatedHit[]}  One entry per hit, in the order the hits were scored.
 */
export function allocateHits(input: AllocationInput): AllocatedHit[] {
    const count = Number.isFinite(input.hitCount) ? Math.max(0, Math.trunc(input.hitCount)) : 0;
    if (count === 0) return [];

    const spread = input.strategy === 'spread' && input.extraTargets.length > 0;
    // The declared target leads the rotation: RAW moves hits OFF it, so it is the
    // first entry rather than one of the extras.
    const rotation: AllocationTarget[] = spread ? [input.originalTarget, ...input.extraTargets] : [input.originalTarget];

    const perTargetCount = new Map<string, number>();
    const out: AllocatedHit[] = [];
    for (let i = 0; i < count; i++) {
        // Hit 0 is pinned to the declared target; the rest rotate.
        const target = i === 0 ? input.originalTarget : rotation[i % rotation.length] ?? input.originalTarget;
        const seen = perTargetCount.get(target.id) ?? 0;
        perTargetCount.set(target.id, seen + 1);
        out.push({ target, hitIndexForTarget: seen });
    }
    return out;
}

/**
 * Group allocated hits by target, preserving both the target order in which they
 * first appear and each target's internal hit order. This is the shape a chat
 * card renders — "two on the Cultist, one on the Champion" rather than a flat
 * list the reader has to re-sort in their head.
 * @param {readonly AllocatedHit[]} hits  The allocation.
 * @returns {Array<{target: AllocationTarget, hits: AllocatedHit[]}>}  One group per target.
 */
export function groupHitsByTarget(hits: readonly AllocatedHit[]): Array<{ target: AllocationTarget; hits: AllocatedHit[] }> {
    const groups = new Map<string, { target: AllocationTarget; hits: AllocatedHit[] }>();
    for (const hit of hits) {
        const existing = groups.get(hit.target.id);
        if (existing === undefined) groups.set(hit.target.id, { target: hit.target, hits: [hit] });
        else existing.hits.push(hit);
    }
    return Array.from(groups.values());
}
