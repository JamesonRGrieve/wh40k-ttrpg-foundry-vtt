/**
 * @file The requisition payment rail (#496).
 *
 * The requisition MATHS already ships and is unit-tested (`requisition-test.ts`,
 * `dw-requisition.ts`, `ow-logistics.ts`), and the Item Piles integration is
 * registered for drops — but nothing connected them. Passing a requisition test
 * never moved an item into anyone's inventory, and the sheet's acquisitions rows
 * were free text with no item link at all.
 *
 * This module is the connective tissue, and deliberately only that: it answers
 * "which economy check gates this acquisition, at what target, and what does a
 * pass/fail cost?" for the active game line. It performs no rolls, touches no
 * documents, and names no items — so it is unit-testable, and adding a line
 * means adding a case here rather than forking the transfer path (the
 * acceptance's "no per-line fork").
 */

import type { I18nKey } from '../types/i18n-keys';
import { type AcquisitionFailureLoss, type AcquisitionLadder, type AvailabilityKey, type CraftsmanshipKey, ratingAfterFailure } from './acquisition-ladder.ts';
import {
    computeLogisticsTarget,
    type LogisticsBreakdown,
    type LogisticsContext,
    type LogisticsStanding,
    logisticsContextFor,
    logisticsStandingFrom,
} from './ow-logistics.ts';
import { getRequisitionTestTarget, type RequisitionModifier } from './requisition-test.ts';

/**
 * Why a requisition was refused, as a langpack key plus its format data. The
 * pure rail never carries English: the caller resolves this through `t()`.
 */
export interface RequisitionRefusal {
    key: I18nKey;
    data?: Record<string, number> | undefined;
}

/** The economy a line requisitions with. */
export type RequisitionEconomy =
    /** DH2: an Influence test, availability + craftsmanship modified. */
    | 'influence'
    /** DW: spend Requisition points, gated by Renown. */
    | 'requisition-points'
    /** OW: a Logistics test. */
    | 'logistics'
    /** BC: an Infamy test. */
    | 'infamy'
    /** RT: Profit Factor. */
    | 'profit-factor'
    /** IM / anything else: no requisition economy — coin only. */
    | 'none';

/** Which economy the active line requisitions with. */
const LINE_ECONOMIES: Readonly<Record<string, RequisitionEconomy>> = {
    dh1: 'influence',
    dh2: 'influence',
    dw: 'requisition-points',
    ow: 'logistics',
    bc: 'infamy',
    rt: 'profit-factor',
    im: 'none',
};

/**
 * The requisition economy for a game line.
 * @param {string | undefined} line  `system.gameSystem` id.
 * @returns {RequisitionEconomy}  Its economy; `none` for an unknown line.
 */
export function requisitionEconomyFor(line: string | undefined): RequisitionEconomy {
    if (line === undefined) return 'none';
    return LINE_ECONOMIES[line] ?? 'none';
}

/** Whether the economy resolves by rolling a test, or by spending a pool. */
export function isTestBasedEconomy(economy: RequisitionEconomy): boolean {
    return economy === 'influence' || economy === 'logistics' || economy === 'infamy';
}

/** What the requester brings to the acquisition. */
export interface RequesterState {
    /** Influence / Logistics / Infamy rating — the test characteristic. */
    rating: number;
    /** Spendable pool for point economies (DW Requisition, RT Profit Factor). */
    pool?: number | undefined;
    /** DW Renown, which gates what Requisition may be spent on. */
    renown?: number | undefined;
    /** Fellowship bonus, for DH2's "more degrees of failure than his Fellowship bonus" Influence loss. */
    fellowshipBonus?: number | undefined;
    /**
     * OW: the squad's full Logistics standing (Munitorum, situational, the
     * persisted battlefront), so the armoury prices exactly as the Logistics
     * Test dialog does (#496). Absent → `rating` on the default front.
     */
    logistics?: LogisticsStanding | undefined;
}

/** What the armoury is being asked for. */
export interface RequestedItem {
    availability: AvailabilityKey;
    craftsmanship?: CraftsmanshipKey | undefined;
    /** Point cost for a pool economy; ignored by test economies. */
    cost?: number | undefined;
    /** Minimum Renown (DW); ignored elsewhere. */
    renownRequired?: number | undefined;
    /** Refused outright when set — #390's undroppable/untradable flag. */
    bound?: boolean | undefined;
    /**
     * The line's bonus for taking a weapon modification as parts to fit
     * personally (DH2 rules, #136). Set by the caller only for a weapon
     * modification on a line that prints the bonus — OW prints none, so the
     * Logistics path never sees it.
     */
    modificationParts?: number | undefined;
}

/** The gate's verdict, before any dice are rolled. */
export interface RequisitionGate {
    economy: RequisitionEconomy;
    /** False when the request cannot proceed at all. */
    allowed: boolean;
    /** Why not, when `allowed` is false. */
    reason?: RequisitionRefusal | undefined;
    /** Test target, for a test economy. */
    target?: number | undefined;
    /** True when the line's ladder prints the rating "Automatic": passed with no roll. */
    automatic?: boolean | undefined;
    /** Modifier provenance, for the chat card (never a lumped total). */
    breakdown?: RequisitionModifier[] | undefined;
    /** OW: the Logistics Test the target came from, so the card prints its Logistics and craftsmanship table rows. */
    logistics?: { context: LogisticsContext; breakdown: LogisticsBreakdown } | undefined;
    /** What a failed test costs the rating, as the buyer's line prints it; `null` when it prints none. */
    failureLoss?: AcquisitionFailureLoss | null | undefined;
    /** Points this costs, for a pool economy. */
    cost?: number | undefined;
}

/**
 * Decide whether an acquisition may be attempted, and on what terms.
 *
 * Availability and craftsmanship are applied AUTOMATICALLY from the item, which
 * is the acceptance's requirement — the sheet's old flow made the player hand-type
 * them, so the modifier could disagree with the item being acquired.
 * @param {RequisitionEconomy} economy  The active line's economy.
 * @param {RequesterState} requester  The acolyte/warband's standing.
 * @param {RequestedItem} item  What is being requisitioned.
 * @param {AcquisitionLadder | null} ladder  The active line's printed availability / craftsmanship ladder.
 * @returns {RequisitionGate}  The verdict and its terms.
 */
export function evaluateRequisition(
    economy: RequisitionEconomy,
    requester: RequesterState,
    item: RequestedItem,
    ladder: AcquisitionLadder | null,
): RequisitionGate {
    if (item.bound === true) {
        return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.Bound' } };
    }
    if (economy === 'none') {
        return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.NoEconomy' } };
    }

    if (economy === 'logistics') return evaluateLogistics(requester, item, ladder);

    if (isTestBasedEconomy(economy)) {
        if (ladder === null) return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.NoEconomy' } };
        const failureLoss = ladder.failureLoss;
        const result = getRequisitionTestTarget({
            influence: requester.rating,
            ladder,
            availability: item.availability,
            ...(item.craftsmanship === undefined ? {} : { craftsmanship: item.craftsmanship }),
            modificationParts: item.modificationParts,
        });
        if (result.kind === 'automatic') return { economy, allowed: true, automatic: true };
        if (result.kind === 'discretion') return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.Discretion' } };
        return { economy, allowed: true, target: result.target, breakdown: result.breakdown, failureLoss };
    }

    // Pool economies: no roll, but the pool must cover it — and DW gates on Renown.
    const cost = item.cost ?? 0;
    const pool = requester.pool ?? 0;
    if (economy === 'requisition-points' && item.renownRequired !== undefined) {
        const renown = requester.renown ?? 0;
        if (renown < item.renownRequired) {
            return {
                economy,
                allowed: false,
                reason: { key: 'WH40K.Requisition.Refusal.Renown', data: { required: item.renownRequired, renown } },
                cost,
            };
        }
    }
    if (pool < cost) {
        return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.Pool', data: { cost, pool } }, cost };
    }
    return { economy, allowed: true, cost };
}

/**
 * OW: the armoury request IS a Logistics Test (core rules), so it is priced by
 * the same `computeLogisticsTarget` as the Logistics Test dialog — the item's
 * Availability in the deployed troop column of the Logistics table, the squad's persisted
 * front conditions, Munitorum Influence, the GM's situational modifier, and
 * the craftsmanship table (#496). The armoury cannot know whether the item is
 * in another deployed regiment's standard kit, so that +20 is not applied here.
 */
function evaluateLogistics(requester: RequesterState, item: RequestedItem, ladder: AcquisitionLadder | null): RequisitionGate {
    const economy: RequisitionEconomy = 'logistics';
    if (ladder === null) return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.NoEconomy' } };
    const standing = requester.logistics ?? logisticsStandingFrom({ logisticsRating: requester.rating });
    const context = logisticsContextFor(standing, { availability: item.availability, craftsmanship: item.craftsmanship ?? 'common', standardKit: false });
    const result = computeLogisticsTarget(context);
    if (result.kind === 'automatic') return { economy, allowed: true, automatic: true };
    if (result.kind === 'discretion') return { economy, allowed: false, reason: { key: 'WH40K.Requisition.Refusal.Discretion' } };
    return {
        economy,
        allowed: true,
        target: result.target,
        breakdown: [{ source: 'rating', value: result.breakdown.rating }],
        logistics: { context, breakdown: result.breakdown },
        failureLoss: ladder.failureLoss,
    };
}

/** What an attempt did to the requester's standing, and whether to transfer. */
export interface RequisitionOutcome {
    /** True when the item should move into the requester's inventory. */
    transfer: boolean;
    /** The requester's rating/pool after the attempt. */
    ratingAfter: number;
    poolAfter?: number | undefined;
}

/**
 * Resolve an attempt into a transfer decision and the cost to the requester.
 *
 * A test economy consumes nothing on success. On a failure it costs the rating
 * only what the buyer's line prints (`gate.failureLoss`, #496): DH1 and DH2
 * print a loss, OW and BC print none. A pool economy always succeeds once the
 * gate allowed it, and debits the pool.
 * @param {RequisitionGate} gate  The gate's verdict.
 * @param {RequesterState} requester  Standing before the attempt.
 * @param {object} [roll]  Test result; required for a test economy.
 * @param {boolean} roll.success  Whether the test passed.
 * @param {number} roll.degreesOfFailure  DoF as the roll engine counts it for the line (a bare fail is 1), for the line's failure loss.
 * @returns {RequisitionOutcome}  Transfer decision and post-attempt standing.
 */
export function resolveRequisition(
    gate: RequisitionGate,
    requester: RequesterState,
    roll?: { success: boolean; degreesOfFailure: number },
): RequisitionOutcome {
    if (!gate.allowed) {
        return { transfer: false, ratingAfter: requester.rating, poolAfter: requester.pool };
    }

    if (gate.automatic === true) return { transfer: true, ratingAfter: requester.rating, poolAfter: requester.pool };

    if (isTestBasedEconomy(gate.economy)) {
        // No roll supplied for a test economy is a caller error, not a pass —
        // failing closed keeps an un-rolled request from handing over the item.
        if (roll === undefined) return { transfer: false, ratingAfter: requester.rating, poolAfter: requester.pool };
        if (roll.success) return { transfer: true, ratingAfter: requester.rating, poolAfter: requester.pool };
        const ratingAfter = ratingAfterFailure(gate.failureLoss ?? null, requester.rating, roll.degreesOfFailure, requester.fellowshipBonus ?? 0);
        return { transfer: false, ratingAfter, poolAfter: requester.pool };
    }

    const cost = gate.cost ?? 0;
    return { transfer: true, ratingAfter: requester.rating, poolAfter: Math.max(0, (requester.pool ?? 0) - cost) };
}
