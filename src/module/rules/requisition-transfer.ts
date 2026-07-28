/**
 * @file Requisition → transfer: the step that actually moves the item (#496).
 *
 * `requisition-rail.ts` answers "may this be attempted, on what terms, and what
 * does pass/fail cost?". It deliberately knows nothing about stock or documents.
 * This module is the next layer down: it adds the ARMOURY's side of the
 * transaction — does the armoury have it, and what is left afterwards — and
 * turns a gate plus a roll into a decision the caller can execute.
 *
 * Entirely pure. Nothing here reads or writes a document, so the whole
 * gate → roll → transfer → decrement path is unit-testable without a world. The
 * caller performs the two writes this returns — create the item on the
 * requester, set the armoury's remaining stock — and does no deciding of its own.
 */

import {
    evaluateRequisition,
    type RequesterState,
    type RequestedItem,
    type RequisitionEconomy,
    type RequisitionGate,
    resolveRequisition,
} from './requisition-rail.ts';

/** What the armoury holds of one line of stock. */
interface StockLine {
    /** Units on the shelf. Ignored when `infinite`. */
    quantity: number;
    /** True for standard-issue kit the Inquisition never runs out of. */
    infinite: boolean;
}

/** A requisition request, with the armoury's side included. */
export interface RequisitionRequest {
    economy: RequisitionEconomy;
    requester: RequesterState;
    item: RequestedItem;
    stock: StockLine;
    /** Units asked for. Defaults to 1. */
    taken?: number | undefined;
}

/** The pre-roll plan: whether it may be attempted, and on what terms. */
export interface RequisitionPlan {
    gate: RequisitionGate;
    /** False when the request cannot proceed — gate refusal OR insufficient stock. */
    allowed: boolean;
    reason?: string | undefined;
    /** Units this request would move. */
    taken: number;
}

/** Units to move when the caller does not say. */
const DEFAULT_TAKEN = 1;

/**
 * Plan a requisition: run the line's gate, then check the armoury can supply it.
 *
 * Stock is checked AFTER the gate so a bound item (#390) or a line with no
 * requisition economy is refused for the honest reason rather than for being
 * out of stock.
 * @param {RequisitionRequest} request  The request, including armoury stock.
 * @returns {RequisitionPlan}  The verdict and terms, before any dice.
 */
export function planRequisition(request: RequisitionRequest): RequisitionPlan {
    const taken = Math.max(1, Math.trunc(request.taken ?? DEFAULT_TAKEN));
    const gate = evaluateRequisition(request.economy, request.requester, request.item);
    if (!gate.allowed) {
        return { gate, allowed: false, reason: gate.reason, taken };
    }
    if (!request.stock.infinite && request.stock.quantity < taken) {
        return { gate, allowed: false, reason: `The armoury holds ${request.stock.quantity}; ${taken} requested.`, taken };
    }
    return { gate, allowed: true, taken };
}

/** The executable result of an attempt. */
export interface RequisitionResult {
    /** True when the item should move into the requester's inventory. */
    transfer: boolean;
    /** The requester's standing after the attempt. */
    ratingAfter: number;
    poolAfter?: number | undefined;
    /**
     * The armoury's stock after the transfer, or undefined when it is unchanged
     * — infinite stock, or a failed attempt. Undefined means "write nothing",
     * which is what keeps a failed roll from silently consuming a unit.
     */
    stockAfter?: number | undefined;
}

/**
 * Turn a plan plus a roll into what to write.
 *
 * Stock is decremented ONLY on a transfer. A failed Influence test costs the
 * acolyte standing, never the armoury a hellgun — which is also why
 * `stockAfter` is undefined rather than the unchanged number: the caller writes
 * only what actually moved.
 * @param {RequisitionPlan} plan  From {@link planRequisition}.
 * @param {RequisitionRequest} request  The same request the plan was built from.
 * @param {object} [roll]  Test result; required for a test economy.
 * @param {boolean} roll.success  Whether the test passed.
 * @param {number} roll.degreesOfFailure  DoF, for the big-failure Influence drop.
 * @returns {RequisitionResult}  What to write, and whether to hand the item over.
 */
export function applyRequisition(plan: RequisitionPlan, request: RequisitionRequest, roll?: { success: boolean; degreesOfFailure: number }): RequisitionResult {
    const outcome = resolveRequisition(plan.gate, request.requester, roll);
    if (!plan.allowed || !outcome.transfer) {
        return { transfer: false, ratingAfter: outcome.ratingAfter, poolAfter: outcome.poolAfter };
    }
    return {
        transfer: true,
        ratingAfter: outcome.ratingAfter,
        poolAfter: outcome.poolAfter,
        ...(request.stock.infinite ? {} : { stockAfter: Math.max(0, request.stock.quantity - plan.taken) }),
    };
}
