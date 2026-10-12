/**
 * @file Pure view-model builder for the Reinforcement Character call dialog
 * (DH2 core pp. 294–295, #77).
 *
 * Turns the RC's printed terms, the warband's Acolytes and the GM's current
 * choices into the dialog's render context: final cost, contribution cap,
 * each Acolyte's row and the call plan or the problem blocking it. Reads no
 * Foundry globals, so the dialog, its story and its tests share it.
 */

import { maxWarbandContribution, planReinforcementCall, type ReinforcementCallResult, reinforcementFinalCost } from '../../rules/reinforcement.ts';

/** An RC's printed call terms (`system.reinforcement` on the NPC). */
export interface ReinforcementTerms {
    influenceMinimum: number | null;
    influenceCost: number | null;
    peerDiscount: { peer: string; amount: string };
}

/** One Acolyte who may call or contribute. */
export interface ReinforcementCandidate {
    id: string;
    name: string;
    influence: number;
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
    rows: Array<ReinforcementCandidate & { isCaller: boolean; meetsMinimum: boolean; contribution: number }>;
    result: ReinforcementCallResult | null;
    /** Localization key for the blocking problem, or '' when the call can go ahead. */
    problemKey: string;
}

/** The printed Peer discount when it is a plain number, else null (a dice formula to roll). */
export function fixedPeerDiscount(amount: string): number | null {
    const trimmed = amount.trim();
    return /^\d+$/u.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

export function buildReinforcementCallView(
    terms: ReinforcementTerms,
    candidates: readonly ReinforcementCandidate[],
    choices: ReinforcementCallChoices,
): ReinforcementCallView {
    const hasTerms = terms.influenceMinimum !== null && terms.influenceCost !== null;
    const influenceMinimum = terms.influenceMinimum ?? 0;
    const baseCost = terms.influenceCost ?? 0;
    const finalCost = reinforcementFinalCost(baseCost, choices.peerDiscount, choices.gmAdjustment);
    const caller = candidates.find((c) => c.id === choices.callerId);
    const rows = candidates.map((c) => {
        const isCaller = c.id === choices.callerId;
        return { ...c, isCaller, meetsMinimum: c.influence >= influenceMinimum, contribution: isCaller ? 0 : choices.contributions[c.id] ?? 0 };
    });
    const result =
        hasTerms && caller !== undefined
            ? planReinforcementCall({
                  callerInfluence: caller.influence,
                  influenceMinimum,
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
        rows,
        result,
        problemKey,
    };
}
