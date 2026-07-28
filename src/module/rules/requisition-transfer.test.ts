import { describe, expect, it } from 'vitest';
import { applyRequisition, planRequisition, type RequisitionRequest } from './requisition-transfer.ts';

/** A DH2 acolyte with Influence 40 requisitioning a scarce item from finite stock. */
function request(overrides: Partial<RequisitionRequest> = {}): RequisitionRequest {
    return {
        economy: 'influence',
        requester: { rating: 40 },
        item: { availability: 'scarce' },
        stock: { quantity: 3, infinite: false },
        ...overrides,
    };
}

const passed = { success: true, degreesOfFailure: 0 };
const failedBadly = { success: false, degreesOfFailure: 4 };

describe('planRequisition (#496)', () => {
    it('allows a request the gate permits and the armoury can supply', () => {
        const plan = planRequisition(request());
        expect(plan.allowed).toBe(true);
        expect(plan.gate.target).toBeGreaterThan(0);
    });

    it('refuses when the armoury holds fewer than asked', () => {
        const plan = planRequisition(request({ stock: { quantity: 1, infinite: false }, taken: 2 }));
        expect(plan.allowed).toBe(false);
        expect(plan.reason).toContain('holds 1');
    });

    it('supplies any quantity from infinite stock', () => {
        expect(planRequisition(request({ stock: { quantity: 0, infinite: true }, taken: 99 })).allowed).toBe(true);
    });

    it('refuses a bound item for BEING BOUND, not for being out of stock', () => {
        // Order matters: checking stock first would report the wrong reason for a
        // #390 item that also happens to be unstocked.
        const plan = planRequisition(request({ item: { availability: 'scarce', bound: true }, stock: { quantity: 0, infinite: false } }));
        expect(plan.allowed).toBe(false);
        expect(plan.reason).toContain('bound');
    });

    it('refuses a line with no requisition economy before consulting stock', () => {
        const plan = planRequisition(request({ economy: 'none' }));
        expect(plan.allowed).toBe(false);
        expect(plan.reason).toContain('no requisition economy');
    });

    it('normalises a nonsense quantity to at least one whole unit', () => {
        expect(planRequisition(request({ taken: 0 })).taken).toBe(1);
        expect(planRequisition(request({ taken: -5 })).taken).toBe(1);
        expect(planRequisition(request({ taken: 2.7 })).taken).toBe(2);
    });
});

describe('applyRequisition', () => {
    it('transfers and decrements finite stock on a passed test', () => {
        const req = request();
        const result = applyRequisition(planRequisition(req), req, passed);
        expect(result.transfer).toBe(true);
        expect(result.stockAfter).toBe(2);
    });

    it('leaves stock untouched on a FAILED test — a bad roll costs standing, not a hellgun', () => {
        const req = request();
        const result = applyRequisition(planRequisition(req), req, failedBadly);
        expect(result.transfer).toBe(false);
        expect(result.stockAfter).toBeUndefined();
        // The big-failure Influence drop still lands (#68).
        expect(result.ratingAfter).toBeLessThan(40);
    });

    it('writes no stock change for infinite stock, even on success', () => {
        // `undefined` rather than the unchanged number, so the caller writes only
        // what actually moved.
        const req = request({ stock: { quantity: 0, infinite: true } });
        expect(applyRequisition(planRequisition(req), req, passed).stockAfter).toBeUndefined();
    });

    it('takes the requested quantity out of stock, not just one', () => {
        const req = request({ stock: { quantity: 5, infinite: false }, taken: 3 });
        expect(applyRequisition(planRequisition(req), req, passed).stockAfter).toBe(2);
    });

    it('never drives stock negative', () => {
        const req = request({ stock: { quantity: 1, infinite: false } });
        expect(applyRequisition(planRequisition(req), req, passed).stockAfter).toBe(0);
    });

    it('transfers nothing when the plan was refused, whatever the roll says', () => {
        const req = request({ item: { availability: 'scarce', bound: true } });
        const result = applyRequisition(planRequisition(req), req, passed);
        expect(result.transfer).toBe(false);
        expect(result.stockAfter).toBeUndefined();
    });

    it('fails CLOSED when a test economy is resolved with no roll', () => {
        // A caller that forgets to roll must not be handed the item.
        const req = request();
        const result = applyRequisition(planRequisition(req), req);
        expect(result.transfer).toBe(false);
        expect(result.stockAfter).toBeUndefined();
    });

    it('debits a pool economy and decrements stock without any roll', () => {
        const req = request({
            economy: 'requisition-points',
            requester: { rating: 0, pool: 10, renown: 20 },
            item: { availability: 'scarce', cost: 4 },
        });
        const result = applyRequisition(planRequisition(req), req);
        expect(result.transfer).toBe(true);
        expect(result.poolAfter).toBe(6);
        expect(result.stockAfter).toBe(2);
    });

    it('refuses a pool economy that cannot pay, and moves nothing', () => {
        const req = request({
            economy: 'requisition-points',
            requester: { rating: 0, pool: 1 },
            item: { availability: 'scarce', cost: 9 },
        });
        const plan = planRequisition(req);
        expect(plan.allowed).toBe(false);
        expect(applyRequisition(plan, req).stockAfter).toBeUndefined();
    });
});
