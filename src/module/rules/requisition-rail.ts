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

import { applyInfluenceLossOnBigFailure, type AvailabilityKey, type CraftsmanshipKey, getRequisitionTestTarget } from './requisition-test.ts';

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
}

/** The gate's verdict, before any dice are rolled. */
export interface RequisitionGate {
    economy: RequisitionEconomy;
    /** False when the request cannot proceed at all. */
    allowed: boolean;
    /** Why not, when `allowed` is false. */
    reason?: string | undefined;
    /** Test target, for a test economy. */
    target?: number | undefined;
    /** Modifier provenance, for the chat card (never a lumped total). */
    breakdown?: { label: string; value: number }[] | undefined;
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
 * @returns {RequisitionGate}  The verdict and its terms.
 */
export function evaluateRequisition(economy: RequisitionEconomy, requester: RequesterState, item: RequestedItem): RequisitionGate {
    if (item.bound === true) {
        return { economy, allowed: false, reason: 'This item is bound and cannot be traded (#390).' };
    }
    if (economy === 'none') {
        return { economy, allowed: false, reason: 'This game line has no requisition economy — purchase with currency instead.' };
    }

    if (isTestBasedEconomy(economy)) {
        const { target, breakdown } = getRequisitionTestTarget({
            influence: requester.rating,
            availability: item.availability,
            ...(item.craftsmanship === undefined ? {} : { craftsmanship: item.craftsmanship }),
        });
        return { economy, allowed: true, target, breakdown };
    }

    // Pool economies: no roll, but the pool must cover it — and DW gates on Renown.
    const cost = item.cost ?? 0;
    const pool = requester.pool ?? 0;
    if (economy === 'requisition-points' && item.renownRequired !== undefined) {
        const renown = requester.renown ?? 0;
        if (renown < item.renownRequired) {
            return { economy, allowed: false, reason: `Requires Renown ${item.renownRequired}; this Battle-Brother has ${renown}.`, cost };
        }
    }
    if (pool < cost) {
        return { economy, allowed: false, reason: `Costs ${cost}; only ${pool} available.`, cost };
    }
    return { economy, allowed: true, cost };
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
 * A test economy consumes nothing on success and drops Influence on a big
 * failure (`applyInfluenceLossOnBigFailure`, #68). A pool economy always
 * succeeds once the gate allowed it, and debits the pool.
 * @param {RequisitionGate} gate  The gate's verdict.
 * @param {RequesterState} requester  Standing before the attempt.
 * @param {object} [roll]  Test result; required for a test economy.
 * @param {boolean} roll.success  Whether the test passed.
 * @param {number} roll.degreesOfFailure  DoF, for the big-failure Influence drop.
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

    if (isTestBasedEconomy(gate.economy)) {
        // No roll supplied for a test economy is a caller error, not a pass —
        // failing closed keeps an un-rolled request from handing over the item.
        if (roll === undefined) return { transfer: false, ratingAfter: requester.rating, poolAfter: requester.pool };
        if (roll.success) return { transfer: true, ratingAfter: requester.rating, poolAfter: requester.pool };
        return { transfer: false, ratingAfter: applyInfluenceLossOnBigFailure(requester.rating, roll.degreesOfFailure), poolAfter: requester.pool };
    }

    const cost = gate.cost ?? 0;
    return { transfer: true, ratingAfter: requester.rating, poolAfter: Math.max(0, (requester.pool ?? 0) - cost) };
}
