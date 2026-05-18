/**
 * Cover system + cover AP degradation (#110 — core.md L10472-10494,
 * Table 7-4 Cover Examples p.229).
 *
 * Cover absorbs hits when the hit location is concealed. Each point
 * of damage to a covered location reduces the cover's AP by 1. Cover
 * with AP 0 is destroyed.
 *
 * Pure helpers — the attack-resolution path's routing decision (cover
 * vs actor), the token-level cover-state representation, and the
 * chat-card surface remain follow-up.
 */

/** Canonical Cover types per Table 7-4 (core.md p.229). */
export type CoverType =
    /** Armour-glass, thin metal, wooden planks (AP 4). */
    | 'thin-metal'
    /** Flakboard, storage crates, sandbags, trees, thick ice (AP 8). */
    | 'sandbags'
    /** Cogitator banks, stasis pods, standard barricades (AP 12). */
    | 'barricade'
    /** Rockcrete, hatchways, thick iron, stone (AP 16). */
    | 'rockcrete'
    /** Armaplas, voidship bulkheads, plasteel (AP 32). */
    | 'plasteel';

/** AP value for each cover type per Table 7-4. */
export const COVER_AP: Record<CoverType, number> = {
    'thin-metal': 4,
    'sandbags': 8,
    'barricade': 12,
    'rockcrete': 16,
    'plasteel': 32,
};

/** Human-readable label for a cover type (chat-card display). */
export const COVER_LABELS: Record<CoverType, string> = {
    'thin-metal': 'Thin Metal / Wooden Planks',
    'sandbags': 'Sandbags / Crates / Trees',
    'barricade': 'Barricade / Cogitator Bank',
    'rockcrete': 'Rockcrete / Stone',
    'plasteel': 'Plasteel / Voidship Bulkhead',
};

export interface CoverHitInput {
    /** Damage dealt to the hit before any reduction. */
    incomingDamage: number;
    /** Current cover AP at the targeted location. */
    coverAP: number;
}

export interface CoverHitResult {
    /** Damage routed to the cover (decrements its AP 1:1, capped at coverAP). */
    coverAbsorbed: number;
    /** Damage that passes through to the actor (incoming − absorbed). */
    overflowToActor: number;
    /** Remaining cover AP after the hit. */
    remainingCoverAP: number;
    /** True when the cover was destroyed by this hit (remainingCoverAP == 0). */
    coverDestroyed: boolean;
}

/**
 * Resolve a hit against cover. RAW: the cover absorbs damage 1:1 up
 * to its current AP; any overflow passes to the actor. Each point of
 * damage absorbed reduces the cover's AP by 1.
 */
export function resolveCoverHit(input: CoverHitInput): CoverHitResult {
    const dmg = Math.max(0, Math.trunc(Number.isFinite(input.incomingDamage) ? input.incomingDamage : 0));
    const ap = Math.max(0, Math.trunc(Number.isFinite(input.coverAP) ? input.coverAP : 0));

    const absorbed = Math.min(dmg, ap);
    const overflow = dmg - absorbed;
    const remaining = ap - absorbed;
    return {
        coverAbsorbed: absorbed,
        overflowToActor: overflow,
        remainingCoverAP: remaining,
        coverDestroyed: remaining === 0 && absorbed > 0,
    };
}

/** Convenience: starting cover AP for a freshly-placed cover of the given type. */
export function startingCoverAP(type: CoverType): number {
    return COVER_AP[type];
}
