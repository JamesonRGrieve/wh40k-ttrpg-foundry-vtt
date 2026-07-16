/**
 * Opposed-check resolution (#449) — the content-agnostic victor + degrees-of-victory
 * primitive every contested roll routes through.
 *
 * An opposed test is target-directed: both sides roll, a victor is decided, and the
 * margin (degrees of victory) drives the consequence. The RAW victor ladder is
 * identical across every line (DH1 p184, DH2 p24, DW p203, BC p37, OW p31, RT core,
 * IM p186/p190 by Success Level):
 *
 *   1. Higher SUCCESS wins (a success beats a failure).
 *   2. Both succeed  → more DEGREES OF SUCCESS wins.
 *   3. Tie on degrees → higher CHARACTERISTIC BONUS wins.
 *   4. Still tied     → LOWEST ROLL wins.
 *   5. Both fail      → STALEMATE (RAW: stalemate or reroll — the caller decides).
 *
 * Foundry-free so it is directly unit-testable, mirroring the other `rules/*` engines.
 */

/** Who prevailed in an opposed check. `stalemate` = both failed (or a true dead heat). */
type OpposedWinner = 'initiator' | 'target' | 'stalemate';

/** One side of an opposed check. `dos`/`dof` are degrees of success/failure (≥ 0). */
export interface OpposedSide {
    /** Whether this side passed its test. */
    readonly success: boolean;
    /** Degrees of success (≥ 0; 0 when the test failed). */
    readonly dos: number;
    /** Degrees of failure (≥ 0; 0 when the test succeeded). */
    readonly dof: number;
    /** Characteristic bonus for the tie-break (higher wins a degree tie). Default 0 if unknown. */
    readonly charBonus?: number;
    /** The d100 total for the final tie-break (lower wins). Omit if unknown. */
    readonly roll?: number;
}

/** Resolved opposed check: the victor and the winner's degrees of victory. */
interface OpposedResult {
    readonly winner: OpposedWinner;
    /** Winner's margin in degrees (≥ 0). 0 on a stalemate or a tie-break decided below the degree level. */
    readonly margin: number;
}

/**
 * Signed degrees of victory from the initiator's perspective — positive when the
 * initiator is ahead, negative when the target is. Combines success/failure degrees
 * across the win/loss boundary (a clear success over a clear failure sums the two).
 * This is the magnitude the consequence scales on.
 */
export function opposedDegrees(initiator: Pick<OpposedSide, 'dos' | 'dof'>, target: Pick<OpposedSide, 'dos' | 'dof'>): number {
    if (initiator.dos > 0) {
        return target.dos > 0 ? initiator.dos - target.dos : initiator.dos + target.dof;
    }
    return target.dos > 0 ? -(initiator.dof + target.dos) : -(initiator.dof - target.dof);
}

/**
 * Resolve an opposed check by the RAW victor ladder, returning the winner and the
 * winner's degrees of victory. Pure: the caller applies the consequence (scaled by
 * `margin`). Tie-break inputs (`charBonus`, `roll`) are optional — when absent the
 * ladder stops at the degree comparison and a true tie yields a `stalemate`.
 */
export function resolveOpposed(initiator: OpposedSide, target: OpposedSide): OpposedResult {
    // 1. A success beats a failure.
    if (initiator.success !== target.success) {
        const winner: OpposedWinner = initiator.success ? 'initiator' : 'target';
        return { winner, margin: Math.abs(opposedDegrees(initiator, target)) };
    }
    // 5. Both fail → stalemate.
    if (!initiator.success) return { winner: 'stalemate', margin: 0 };

    // 2. Both succeed → most degrees of success.
    if (initiator.dos !== target.dos) {
        const winner: OpposedWinner = initiator.dos > target.dos ? 'initiator' : 'target';
        return { winner, margin: Math.abs(initiator.dos - target.dos) };
    }
    // 3. Tie on degrees → higher characteristic bonus.
    const ib = initiator.charBonus ?? 0;
    const tb = target.charBonus ?? 0;
    if (ib !== tb) return { winner: ib > tb ? 'initiator' : 'target', margin: 0 };

    // 4. Still tied → lowest roll wins (when both rolls are known).
    if (initiator.roll !== undefined && target.roll !== undefined && initiator.roll !== target.roll) {
        return { winner: initiator.roll < target.roll ? 'initiator' : 'target', margin: 0 };
    }
    // True dead heat.
    return { winner: 'stalemate', margin: 0 };
}
