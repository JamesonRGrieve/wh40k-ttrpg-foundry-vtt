/**
 * Calling in a Reinforcement Character (DH2 core rules, #77).
 *
 * Each Reinforcement Character (RC) prints an **Influence Minimum** and an
 * **Influence Cost**. The calling Acolyte needs Influence ≥ the minimum and
 * permanently spends the cost. Other warband members may contribute no more
 * than half the cost (rounded up), each permanently losing what they put in.
 * The GM may raise or lower the cost, and many RCs print a Peer-talent discount.
 * Calling an RC reduces the warband's Subtlety by the final cost.
 *
 * Some RCs add terms for the caller. The Thrice-Bound Daemonhost (a DH2
 * supplement) needs a caller with Forbidden Lore (Daemonology) at Trained
 * (rank 2), who gains 1d5 Corruption. The rank gate is here. The Corruption is
 * rolled and applied by the call flow through the actor's Corruption update.
 *
 * The per-RC values are compendium data on the NPC (`system.reinforcement`).
 * This module holds only the content-agnostic call math.
 */

import { nonNegInt } from './_num.ts';

/** The cost after the Peer discount and any GM adjustment, floored at 0. */
export function reinforcementFinalCost(baseCost: number, peerDiscount: number, gmAdjustment: number): number {
    const adjustment = Number.isFinite(gmAdjustment) ? Math.trunc(gmAdjustment) : 0;
    return Math.max(0, nonNegInt(baseCost) - nonNegInt(peerDiscount) + adjustment);
}

/** The most the rest of the warband may contribute: half the cost, rounded up. */
export function maxWarbandContribution(finalCost: number): number {
    return Math.ceil(nonNegInt(finalCost) / 2);
}

/** One other Acolyte's contribution toward the cost. */
interface ReinforcementContribution {
    id: string;
    /** Their current Influence. */
    influence: number;
    /** What they put toward the cost. */
    amount: number;
}

/** The caller's rank in the skill the RC requires, and the rank required (null when it requires none). */
interface CallerSkillCheck {
    rank: number;
    required: number | null;
}

export interface ReinforcementCallInput {
    callerInfluence: number;
    influenceMinimum: number;
    callerSkill: CallerSkillCheck;
    finalCost: number;
    contributions: readonly ReinforcementContribution[];
}

/** Why a call can't go ahead. */
type ReinforcementCallProblem = 'belowMinimum' | 'callerSkill' | 'contributionCap' | 'contributorShort' | 'callerShort';

/** Whether the caller meets the RC's skill requirement (always true when it prints none). */
export function meetsCallerSkill(check: CallerSkillCheck): boolean {
    return check.required === null || nonNegInt(check.rank) >= check.required;
}

interface ReinforcementCallPlan {
    finalCost: number;
    /** What the caller spends: the cost less the contributions. */
    callerPays: number;
    /** Non-zero contributions only. */
    contributions: Array<{ id: string; amount: number }>;
    /** The warband's Subtlety loss, equal to the final cost. */
    subtletyLoss: number;
}

export type ReinforcementCallResult = { ok: true; plan: ReinforcementCallPlan } | { ok: false; problem: ReinforcementCallProblem };

/**
 * Check a proposed call and split its cost. A call fails when the caller is
 * below the RC's Influence Minimum or lacks its required skill rank, when
 * contributions exceed half the cost, or when anyone would spend more
 * Influence than they have.
 */
export function planReinforcementCall(input: ReinforcementCallInput): ReinforcementCallResult {
    const callerInfluence = nonNegInt(input.callerInfluence);
    if (callerInfluence < nonNegInt(input.influenceMinimum)) return { ok: false, problem: 'belowMinimum' };
    if (!meetsCallerSkill(input.callerSkill)) return { ok: false, problem: 'callerSkill' };
    const finalCost = nonNegInt(input.finalCost);
    const contributions = input.contributions
        .map((c) => ({ id: c.id, influence: nonNegInt(c.influence), amount: nonNegInt(c.amount) }))
        .filter((c) => c.amount > 0);
    const contributed = contributions.reduce((sum, c) => sum + c.amount, 0);
    if (contributed > maxWarbandContribution(finalCost)) return { ok: false, problem: 'contributionCap' };
    if (contributions.some((c) => c.amount > c.influence)) return { ok: false, problem: 'contributorShort' };
    const callerPays = finalCost - contributed;
    if (callerPays > callerInfluence) return { ok: false, problem: 'callerShort' };
    return {
        ok: true,
        plan: { finalCost, callerPays, contributions: contributions.map(({ id, amount }) => ({ id, amount })), subtletyLoss: finalCost },
    };
}
