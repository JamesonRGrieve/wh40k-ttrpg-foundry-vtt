/**
 * Deathwatch Renown RAW resolver (#164 — core.md §"RENOWN", p. 5880,
 * Table 5-2; per-mission awards in rites.md Table 5-1 and §"LOSING
 * RENOWN").
 *
 * Pure functions over a Battle-Brother's Renown score. The caller
 * (character DataModel, armoury requisition prompt, chat card) owns
 * I/O; this module owns the table lookups, rank resolution, and
 * Renown-arithmetic clamps.
 *
 * Canonical rules referenced here:
 *   - TABLE 5-2: Renown rank thresholds (Initiated … Hero).
 *   - "Renown Requirements": Armoury items list a minimum Renown rank;
 *     the requisitioning Battle-Brother must equal or exceed that rank.
 *   - "Losing Renown": Renown can be lost, but never below 0 (RAW does
 *     not document a negative-Renown state; clamp at the floor).
 *
 * Renown has no hard upper cap in RAW — per-mission awards can push
 * Hero-rank Marines beyond 100. We expose `RENOWN_MAX = 100` as the
 * documented "soft cap" for UI display only and do NOT clamp the
 * arithmetic against it; consumers that want a visual ceiling should
 * `Math.min(RENOWN_MAX, value)` at the rendering edge.
 */

import { compareLadder } from './_ladder.ts';

/** Renown rank identifiers — ordered ascending by threshold. */
export type RenownRank = 'initiated' | 'respected' | 'distinguished' | 'famed' | 'hero';

/** Inclusive Renown range that resolves to a given rank. */
export interface RenownRankRange {
    /** Lower bound of Renown for this rank (inclusive). */
    min: number;
    /**
     * Upper bound of Renown for this rank (inclusive). `Infinity` for
     * Hero — there is no documented ceiling in RAW.
     */
    max: number;
}

/**
 * TABLE 5-2 — Renown Rank thresholds. Ordered ascending; the resolver
 * picks the *highest* rank whose `min` ≤ current Renown. Hero has no
 * upper bound (`Infinity`); per-mission awards can carry Marines past
 * 100 without breaking the lookup.
 */
export const RENOWN_THRESHOLDS: Record<RenownRank, RenownRankRange> = {
    initiated: { min: 0, max: 19 },
    respected: { min: 20, max: 39 },
    distinguished: { min: 40, max: 59 },
    famed: { min: 60, max: 79 },
    hero: { min: 80, max: Number.POSITIVE_INFINITY },
};

/**
 * Canonical rank order, ascending. Useful when comparing two ranks
 * (e.g. armoury gate: actor rank ≥ required rank).
 */
export const RENOWN_RANK_ORDER: readonly RenownRank[] = ['initiated', 'respected', 'distinguished', 'famed', 'hero'];

/** Floor on Renown — RAW does not document a negative-Renown state. */
export const RENOWN_MIN = 0;

/**
 * Soft cap on Renown for UI display. RAW does not enforce this — Hero
 * Marines can exceed 100 through continued per-mission awards. Consumers
 * that want a capped progress bar should clamp at the rendering edge.
 */
export const RENOWN_MAX = 100;

/** Resolve the active rank for a given Renown value. */
export function getRenownRank(renown: number): RenownRank {
    if (!Number.isFinite(renown) || renown <= RENOWN_THRESHOLDS.initiated.min) {
        return 'initiated';
    }
    let active: RenownRank = 'initiated';
    for (const rank of RENOWN_RANK_ORDER) {
        const range = RENOWN_THRESHOLDS[rank];
        if (renown >= range.min) active = rank;
    }
    return active;
}

/** Numeric rank index (0..4). Useful for ≥ / ≤ comparisons between ranks. */
export function renownRankIndex(rank: RenownRank): number {
    return RENOWN_RANK_ORDER.indexOf(rank);
}

/**
 * Armoury Requisition gate. A Battle-Brother may requisition an item
 * whose required Renown rank is equal to or lower than their own.
 *
 * `renown` is the actor's current Renown value (not the rank — the
 * function resolves the rank itself so callers don't have to).
 * `requiredRank` is the item's minimum rank gate (from the compendium).
 */
export function canRequisition(args: { renown: number; requiredRank: RenownRank }): boolean {
    const actorRank = getRenownRank(args.renown);
    // Actor's rank must equal or exceed the required rank on the renown ladder.
    return compareLadder(RENOWN_RANK_ORDER, actorRank, args.requiredRank) >= 0;
}

/**
 * Apply a Renown award. Clamps the floor at `RENOWN_MIN` but does NOT
 * clamp the ceiling — RAW per-mission awards can carry Hero-rank
 * Marines past 100.
 *
 * Non-positive or non-finite `amount` is a no-op (returns the input
 * value clamped at the floor) so accidental negative awards don't
 * become silent losses.
 */
export function awardRenown(currentRenown: number, amount: number): number {
    const base = Number.isFinite(currentRenown) ? currentRenown : RENOWN_MIN;
    if (!Number.isFinite(amount) || amount <= 0) {
        return Math.max(RENOWN_MIN, base);
    }
    return Math.max(RENOWN_MIN, base + amount);
}

/**
 * Apply a Renown loss. Clamps at `RENOWN_MIN` — RAW "LOSING RENOWN"
 * does not contemplate a negative-Renown state.
 *
 * Non-positive or non-finite `amount` is a no-op; callers wanting to
 * *add* Renown should call `awardRenown` instead.
 */
export function loseRenown(currentRenown: number, amount: number): number {
    const base = Number.isFinite(currentRenown) ? currentRenown : RENOWN_MIN;
    if (!Number.isFinite(amount) || amount <= 0) {
        return Math.max(RENOWN_MIN, base);
    }
    return Math.max(RENOWN_MIN, base - amount);
}
