/**
 * @file Pure view-model builder for the Reinforcement Character call dialog
 * (DH2 core pp. 294–295, #77).
 *
 * Turns the RC's printed terms, the warband's Acolytes and the GM's current
 * choices into the dialog's render context: final cost, contribution cap,
 * each Acolyte's row and the call plan or the problem blocking it. Reads no
 * Foundry globals, so the dialog, its story and its tests share it.
 */

import {
    maxWarbandContribution,
    meetsCallerSkill,
    planReinforcementCall,
    type ReinforcementCallResult,
    reinforcementFinalCost,
} from '../../rules/reinforcement.ts';

/** Extra terms an RC prints for its caller (`system.reinforcement.caller`). */
export interface ReinforcementCallerTerms {
    /** Actor skill key the caller must have, or '' for none. */
    skill: string;
    /** Specialisation of that skill, or '' for a plain skill. */
    specialization: string;
    /** Minimum rank, or null for none. */
    rank: number | null;
    /** Corruption the caller gains: a number, a dice formula, or '' for none. */
    corruption: string;
}

/** An RC's printed call terms (`system.reinforcement` on the NPC). */
export interface ReinforcementTerms {
    influenceMinimum: number | null;
    influenceCost: number | null;
    peerDiscount: { peer: string; amount: string };
    caller: ReinforcementCallerTerms;
}

/** One Acolyte who may call or contribute. */
export interface ReinforcementCandidate {
    id: string;
    name: string;
    influence: number;
    /** Their rank in the skill the RC requires of its caller (0 when it requires none). */
    skillRank: number;
}

/** What the GM has chosen so far. */
export interface ReinforcementCallChoices {
    callerId: string;
    /** Contribution per Acolyte id (the caller's own entry is ignored). */
    contributions: Readonly<Record<string, number>>;
    /** The Peer discount applied, already rolled when the printed amount is a formula; 0 when not applied. */
    peerDiscount: number;
    gmAdjustment: number;
}

/** The caller terms as the dialog and panel show them, or null when the RC prints none. */
interface CallerRequirementView {
    /** "Forbidden Lore (Daemonology)", or '' when there is no skill requirement. */
    skillLabel: string;
    rank: number | null;
    /** Langpack key of the rank name (WH40K.Skills.Rank.*), or '' for no rank. */
    rankKey: string;
    corruption: string;
}

export interface ReinforcementCallView {
    hasTerms: boolean;
    influenceMinimum: number;
    baseCost: number;
    peer: string;
    peerAmount: string;
    peerDiscount: number;
    gmAdjustment: number;
    finalCost: number;
    contributionCap: number;
    callerId: string;
    callerRequirement: CallerRequirementView | null;
    rows: Array<ReinforcementCandidate & { isCaller: boolean; meetsMinimum: boolean; meetsSkill: boolean; contribution: number }>;
    result: ReinforcementCallResult | null;
    /** Localization key for the blocking problem, or '' when the call can go ahead. */
    problemKey: string;
}

/** A printed amount when it is a plain number, else null (a dice formula to roll, or blank). */
export function fixedAmount(amount: string): number | null {
    const trimmed = amount.trim();
    return /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

/** DH2 skill rank names, rank 1–4 (core p. 80). */
const RANK_KEYS = ['WH40K.Skills.Rank.Known', 'WH40K.Skills.Rank.Trained', 'WH40K.Skills.Rank.Experienced', 'WH40K.Skills.Rank.Veteran'] as const;

/** The skill rank the RC requires of its caller, or null when it requires none. */
export function requiredCallerRank(caller: ReinforcementCallerTerms): number | null {
    return caller.skill === '' ? null : caller.rank ?? 1;
}

/**
 * The caller terms for display. `skillLabel` is the required skill's display
 * name (the caller resolves it from the skill catalogue).
 */
export function callerRequirementView(caller: ReinforcementCallerTerms, skillLabel: string): CallerRequirementView | null {
    const rank = requiredCallerRank(caller);
    if (rank === null && caller.corruption.trim() === '') return null;
    const label = caller.specialization === '' ? skillLabel : `${skillLabel} (${caller.specialization})`;
    return {
        skillLabel: rank === null ? '' : label,
        rank,
        rankKey: rank === null ? '' : RANK_KEYS[Math.min(Math.max(rank, 1), RANK_KEYS.length) - 1] ?? '',
        corruption: caller.corruption.trim(),
    };
}

/** An actor's skill rows, read for their display labels. */
export type SkillLabelSource = Readonly<Record<string, { readonly label?: string | undefined } | undefined>>;

/** The required skill's display name from an actor's skill rows, or '' when the RC requires none. */
export function requiredSkillLabel(skills: SkillLabelSource, caller: ReinforcementCallerTerms): string {
    if (caller.skill === '') return '';
    return skills[caller.skill]?.label ?? caller.skill;
}

/** One skill row as the character DataModel exposes it: a rank, and specialist entries. */
interface SkillRankSource {
    readonly rank?: number | undefined;
    readonly entries?:
        | ReadonlyArray<{ readonly name?: string | undefined; readonly specialization?: string | undefined; readonly rank?: number | undefined }>
        | undefined;
}

/**
 * An actor's rank in `skill` (and `specialization`, for a specialist skill): 0
 * when it has no such skill or entry. A specialist entry matches by its name or
 * specialisation, case-insensitively.
 */
export function actorSkillRank(skills: Readonly<Record<string, SkillRankSource | undefined>>, skill: string, specialization: string): number {
    const row = skills[skill];
    if (row === undefined) return 0;
    if (specialization === '') return row.rank ?? 0;
    const wanted = specialization.trim().toLowerCase();
    const entry = row.entries?.find((e) => {
        const name = e.name ?? '';
        return (name === '' ? e.specialization ?? '' : name).trim().toLowerCase() === wanted;
    });
    return entry?.rank ?? 0;
}

export function buildReinforcementCallView(
    terms: ReinforcementTerms,
    candidates: readonly ReinforcementCandidate[],
    choices: ReinforcementCallChoices,
    skillLabel: string,
): ReinforcementCallView {
    const hasTerms = terms.influenceMinimum !== null && terms.influenceCost !== null;
    const influenceMinimum = terms.influenceMinimum ?? 0;
    const baseCost = terms.influenceCost ?? 0;
    const requiredRank = requiredCallerRank(terms.caller);
    const finalCost = reinforcementFinalCost(baseCost, choices.peerDiscount, choices.gmAdjustment);
    const caller = candidates.find((c) => c.id === choices.callerId);
    const rows = candidates.map((c) => {
        const isCaller = c.id === choices.callerId;
        return {
            ...c,
            isCaller,
            meetsMinimum: c.influence >= influenceMinimum,
            meetsSkill: meetsCallerSkill({ rank: c.skillRank, required: requiredRank }),
            contribution: isCaller ? 0 : choices.contributions[c.id] ?? 0,
        };
    });
    const result =
        hasTerms && caller !== undefined
            ? planReinforcementCall({
                  callerInfluence: caller.influence,
                  influenceMinimum,
                  callerSkill: { rank: caller.skillRank, required: requiredRank },
                  finalCost,
                  contributions: rows.filter((r) => !r.isCaller).map((r) => ({ id: r.id, influence: r.influence, amount: r.contribution })),
              })
            : null;
    let problemKey = '';
    if (!hasTerms) problemKey = 'WH40K.Reinforcement.Problem.noTerms';
    else if (result === null) problemKey = 'WH40K.Reinforcement.Problem.noCaller';
    else if (!result.ok) problemKey = `WH40K.Reinforcement.Problem.${result.problem}`;
    return {
        hasTerms,
        influenceMinimum,
        baseCost,
        peer: terms.peerDiscount.peer,
        peerAmount: terms.peerDiscount.amount,
        peerDiscount: choices.peerDiscount,
        gmAdjustment: choices.gmAdjustment,
        finalCost,
        contributionCap: maxWarbandContribution(finalCost),
        callerId: choices.callerId,
        callerRequirement: callerRequirementView(terms.caller, skillLabel),
        rows,
        result,
        problemKey,
    };
}
