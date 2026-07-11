/**
 * Pure skill-target math shared by `CreatureTemplate` (PC path) and `NPCData`
 * (#423). The untrained-base rule and the trained rank ladder were duplicated
 * three times (creature skill body, creature specialist entry, NPC
 * `getSkillTarget`). System-agnostic across all 7 lines: the only branch is the
 * `usesAptitudes` flag (DH2e-style flat −20 vs. career half-characteristic).
 */

/**
 * Untrained-skill base value. In systems that use aptitudes (DH2e's
 * Known/Trained/Experienced/Veteran ladder) an untrained test is the full
 * characteristic minus a flat 20; career-based systems use half the
 * characteristic (rounded down). Pure.
 */
export function untrainedSkillBase(charTotal: number, usesAptitudes: boolean): number {
    return usesAptitudes ? charTotal - 20 : Math.floor(charTotal / 2);
}

/** The rank-derived display flags and computed target for a skill. */
export interface SkillTarget {
    /** Effective rank (0 = untrained, 1 = trained … 4 = veteran). */
    rank: number;
    /** Rank ≥ 1. */
    trained: boolean;
    /** Rank ≥ 2. */
    plus10: boolean;
    /** Rank ≥ 3. */
    plus20: boolean;
    /** Rank ≥ 4. */
    plus30: boolean;
    /** Base value + training bonus + flat bonus. */
    current: number;
}

/**
 * Compute a skill's rank flags and target number from its effective rank.
 *
 * - **Base value** — full characteristic once trained (`rank > 0`); otherwise
 *   {@link untrainedSkillBase}.
 * - **Training bonus ladder** — rank ≥ 4 → +30, ≥ 3 → +20, ≥ 2 → +10, else +0.
 * - **`current`** — base value + training bonus + `flatBonus` (the per-skill
 *   `bonus` modifier).
 *
 * `flatBonus` is the caller's already-defaulted `skill.bonus || 0`. Pure.
 */
export function computeSkillTarget(charTotal: number, effectiveRank: number, flatBonus: number, usesAptitudes: boolean): SkillTarget {
    const baseValue = effectiveRank > 0 ? charTotal : untrainedSkillBase(charTotal, usesAptitudes);
    const trainingBonus = effectiveRank >= 4 ? 30 : effectiveRank >= 3 ? 20 : effectiveRank >= 2 ? 10 : 0;
    return {
        rank: effectiveRank,
        trained: effectiveRank >= 1,
        plus10: effectiveRank >= 2,
        plus20: effectiveRank >= 3,
        plus30: effectiveRank >= 4,
        current: baseValue + trainingBonus + flatBonus,
    };
}
