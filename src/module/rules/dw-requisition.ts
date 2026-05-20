/**
 * Deathwatch Requisition RAW resolver (#165 — core.md §"REQUISITION",
 * p. 5845, Tables 5-1 and 5-3).
 *
 * Pure functions over a Battle-Brother's Requisition-Point (RP) budget
 * and the armoury catalogue. The caller (character DataModel, armoury
 * prompt, chat card) owns I/O; this module owns the cost math, rank
 * gate, RP arithmetic, and pooled-requisition validation.
 *
 * Canonical rules referenced here:
 *   - TABLE 5-1: per-Mission RP budget per Battle-Brother (mission
 *     rating → RP). The RP-per-rating mapping is *content* (Direction
 *     #7), so this module accepts it as a caller-supplied
 *     {@link RequisitionPolicy} instead of hardcoding the table.
 *   - TABLE 5-3: Craftsmanship cost multipliers (Poor ×0.5, Common ×1,
 *     Good ×1.5, Best ×2). These are RAW-fixed multipliers, not
 *     compendium content, so they live here.
 *   - "Renown Requirements": delegated to {@link canRequisition} in
 *     `./dw-renown.ts` — an item's required Renown rank must be ≤ the
 *     actor's rank.
 *   - "Pooling Requisition": Battle-Brothers may pool RP for a single
 *     item; the sum of contributions must equal or exceed the item
 *     cost, and no contributor may pledge more RP than they have.
 */

import { canRequisition, type RenownRank } from './dw-renown.ts';

/** Craftsmanship tier identifiers. */
export type Craftsmanship = 'poor' | 'common' | 'good' | 'best';

/**
 * TABLE 5-3 — Craftsmanship cost multipliers. Applied to an item's base
 * RP cost to produce the actual cost. Best-craftsmanship gear costs
 * twice as much as Common; Poor-craftsmanship gear costs half as much.
 */
export const CRAFTSMANSHIP_MULTIPLIER: Record<Craftsmanship, number> = {
    poor: 0.5,
    common: 1,
    good: 1.5,
    best: 2,
};

/**
 * Mission-rating identifier — content-agnostic tier name. The RP budget
 * each rating yields per Battle-Brother is compendium content and is
 * supplied via {@link RequisitionPolicy}.
 */
export type MissionRating = 'standard' | 'extended' | 'priority' | 'critical';

/**
 * Mission-rating → RP-per-Battle-Brother policy. Sourced from compendium
 * content (TABLE 5-1) so this module remains content-agnostic per
 * Direction #7.
 */
export interface RequisitionPolicy {
    /** Map of mission rating → RP awarded per Battle-Brother. */
    ratingToRpPerBrother: Record<MissionRating, number>;
}

/** Arguments to {@link computeMissionRpBudget}. */
export interface ComputeMissionRpBudgetArgs {
    /** The mission's rating, drawn from the briefing. */
    missionRating: MissionRating;
    /** Number of Battle-Brothers on the kill-team. */
    brotherCount: number;
    /** Policy mapping mission ratings to per-brother RP. */
    policy: RequisitionPolicy;
}

/** Arguments to {@link canActorRequisition}. */
export interface CanActorRequisitionArgs {
    /** Actor's current Renown value (resolved to rank internally). */
    actorRenown: number;
    /** Item's minimum required Renown rank from the compendium. */
    itemRequiredRank: RenownRank;
    /** Actor's currently-available RP. */
    actorRp: number;
    /** Item's final RP cost (after craftsmanship multiplier). */
    itemCost: number;
}

/** Result of {@link canActorRequisition}. */
export interface CanActorRequisitionResult {
    allowed: boolean;
    reason?: 'rank-too-low' | 'insufficient-rp';
}

/** One Battle-Brother's pledged contribution to a pooled requisition. */
export interface PooledContribution {
    /** Identifier for the contributing brother (actor id or similar). */
    brotherId: string;
    /** RP this brother is pledging toward the pooled item. */
    rpContributed: number;
}

/** Arguments to {@link canPoolRequisition}. */
export interface CanPoolRequisitionArgs {
    /** All pledged contributions to this requisition. */
    contributions: readonly PooledContribution[];
    /** Final RP cost of the item being pooled for. */
    itemCost: number;
    /** Map of brotherId → currently-available RP for each contributor. */
    brothersRpAvailable: Readonly<Record<string, number>>;
}

/** Result of {@link canPoolRequisition}. */
export interface CanPoolRequisitionResult {
    allowed: boolean;
    totalContributed: number;
    reason?: 'insufficient-pool' | 'over-allocated';
}

/**
 * Apply the craftsmanship multiplier to an item's base RP cost. Non-
 * finite or negative `baseCost` is clamped to zero so callers can pass
 * raw compendium values without pre-sanitising.
 *
 * The result is intentionally NOT rounded — RAW Common items have
 * integer base costs, and the only fractional multiplier (Poor ×0.5)
 * either pairs with even base costs in the catalogue or is rounded by
 * the GM at table. Callers that need an integer can `Math.ceil` at the
 * presentation edge.
 */
export function computeItemCost(baseCost: number, craftsmanship: Craftsmanship): number {
    const safeBase = Number.isFinite(baseCost) && baseCost > 0 ? baseCost : 0;
    const multiplier = CRAFTSMANSHIP_MULTIPLIER[craftsmanship];
    return safeBase * multiplier;
}

/**
 * Resolve a single-actor requisition attempt. Returns `allowed: true`
 * only when both the Renown gate and the RP gate clear.
 *
 * Order of evaluation is deterministic so callers can render a single
 * blocking reason: rank is checked first (gear is gated by Renown rank
 * regardless of RP), RP second.
 */
export function canActorRequisition(args: CanActorRequisitionArgs): CanActorRequisitionResult {
    const rankOk = canRequisition({ renown: args.actorRenown, requiredRank: args.itemRequiredRank });
    if (!rankOk) {
        return { allowed: false, reason: 'rank-too-low' };
    }
    if (!(args.actorRp >= args.itemCost)) {
        return { allowed: false, reason: 'insufficient-rp' };
    }
    return { allowed: true };
}

/**
 * Validate a pooled requisition. Two gates apply:
 *
 *   1. Over-allocation: no contributor may pledge more RP than they
 *      currently have available. A missing entry in
 *      `brothersRpAvailable` is treated as zero — an unknown brother
 *      cannot pledge anything.
 *   2. Pool sufficiency: the sum of pledges must equal or exceed the
 *      item cost.
 *
 * The Renown gate is NOT enforced here — by RAW the *requisitioning*
 * Battle-Brother (the one taking custody of the item) must meet the
 * rank requirement; pool contributors do not. Callers should run
 * {@link canActorRequisition} on the holder separately with `actorRp`
 * set to `itemCost` (or the holder's pledge) so the rank check fires.
 */
export function canPoolRequisition(args: CanPoolRequisitionArgs): CanPoolRequisitionResult {
    let total = 0;
    for (const contribution of args.contributions) {
        const available = args.brothersRpAvailable[contribution.brotherId] ?? 0;
        if (contribution.rpContributed > available) {
            return {
                allowed: false,
                totalContributed: total + contribution.rpContributed,
                reason: 'over-allocated',
            };
        }
        total += contribution.rpContributed;
    }
    if (total < args.itemCost) {
        return { allowed: false, totalContributed: total, reason: 'insufficient-pool' };
    }
    return { allowed: true, totalContributed: total };
}

/**
 * Compute the kill-team's total per-Mission RP budget. The policy maps
 * the mission's rating to RP-per-brother (compendium content); the
 * total budget is that per-brother allocation multiplied by the number
 * of Battle-Brothers fielded.
 *
 * Non-positive or non-finite `brotherCount` resolves to zero so a
 * mis-configured mission yields no RP rather than negative budget.
 */
export function computeMissionRpBudget(args: ComputeMissionRpBudgetArgs): number {
    const perBrother = args.policy.ratingToRpPerBrother[args.missionRating];
    if (!Number.isFinite(perBrother) || perBrother <= 0) return 0;
    if (!Number.isFinite(args.brotherCount) || args.brotherCount <= 0) return 0;
    return perBrother * args.brotherCount;
}
