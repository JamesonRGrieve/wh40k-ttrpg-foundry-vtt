import { describe, expect, it } from 'vitest';
import { evaluateRequisition, isTestBasedEconomy, requisitionEconomyFor, resolveRequisition } from './requisition-rail.ts';

describe('requisitionEconomyFor (#496)', () => {
    it('maps each line to its own economy', () => {
        expect(requisitionEconomyFor('dh2')).toBe('influence');
        expect(requisitionEconomyFor('dh1')).toBe('influence');
        expect(requisitionEconomyFor('dw')).toBe('requisition-points');
        expect(requisitionEconomyFor('ow')).toBe('logistics');
        expect(requisitionEconomyFor('bc')).toBe('infamy');
        expect(requisitionEconomyFor('rt')).toBe('profit-factor');
    });

    it('reports no economy for IM and for an unknown line', () => {
        expect(requisitionEconomyFor('im')).toBe('none');
        expect(requisitionEconomyFor('nonsense')).toBe('none');
        expect(requisitionEconomyFor(undefined)).toBe('none');
    });

    it('classifies test economies apart from pool economies', () => {
        for (const economy of ['influence', 'logistics', 'infamy'] as const) {
            expect(isTestBasedEconomy(economy)).toBe(true);
        }
        for (const economy of ['requisition-points', 'profit-factor', 'none'] as const) {
            expect(isTestBasedEconomy(economy)).toBe(false);
        }
    });
});

describe('evaluateRequisition — the gate', () => {
    it('applies availability and craftsmanship AUTOMATICALLY from the item', () => {
        // The old flow made the player hand-type these, so the modifier could
        // disagree with the item actually being acquired.
        const gate = evaluateRequisition('influence', { rating: 40 }, { availability: 'rare', craftsmanship: 'good' });
        expect(gate.allowed).toBe(true);
        // 40 Influence − 20 (rare) − 10 (good) = 10
        expect(gate.target).toBe(10);
        expect(gate.breakdown).toEqual([
            { label: 'Influence', value: 40 },
            { label: 'Availability (rare)', value: -20 },
            { label: 'Craftsmanship (good)', value: -10 },
        ]);
    });

    it('carries the modifier breakdown, never a lumped total', () => {
        // Roll-transparency: the card must be able to print each component.
        const gate = evaluateRequisition('logistics', { rating: 30 }, { availability: 'scarce' });
        expect(gate.breakdown?.length).toBe(2);
    });

    it('refuses a bound item outright (#390)', () => {
        const gate = evaluateRequisition('influence', { rating: 90 }, { availability: 'common', bound: true });
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/bound/i);
    });

    it('refuses when the line has no requisition economy', () => {
        const gate = evaluateRequisition('none', { rating: 50 }, { availability: 'common' });
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toMatch(/currency/i);
    });

    it('gates a pool economy on the pool covering the cost', () => {
        expect(evaluateRequisition('requisition-points', { rating: 0, pool: 10 }, { availability: 'common', cost: 5 }).allowed).toBe(true);
        const short = evaluateRequisition('requisition-points', { rating: 0, pool: 3 }, { availability: 'common', cost: 5 });
        expect(short.allowed).toBe(false);
        expect(short.reason).toMatch(/only 3 available/);
    });

    it('gates Deathwatch Requisition on Renown as well as points', () => {
        const item = { availability: 'common' as const, cost: 5, renownRequired: 20 };
        const blocked = evaluateRequisition('requisition-points', { rating: 0, pool: 100, renown: 10 }, item);
        expect(blocked.allowed).toBe(false);
        expect(blocked.reason).toMatch(/Renown 20/);
        expect(evaluateRequisition('requisition-points', { rating: 0, pool: 100, renown: 40 }, item).allowed).toBe(true);
    });
});

describe('resolveRequisition — the outcome', () => {
    const gate = (rating: number) => evaluateRequisition('influence', { rating }, { availability: 'common' });

    it('transfers on a passed test and costs nothing', () => {
        const out = resolveRequisition(gate(50), { rating: 50 }, { success: true, degreesOfFailure: 0 });
        expect(out).toEqual({ transfer: true, ratingAfter: 50, poolAfter: undefined });
    });

    it('does not transfer on a failure, and drops Influence on a BIG failure (#68)', () => {
        const small = resolveRequisition(gate(50), { rating: 50 }, { success: false, degreesOfFailure: 1 });
        expect(small).toMatchObject({ transfer: false, ratingAfter: 50 });
        const big = resolveRequisition(gate(50), { rating: 50 }, { success: false, degreesOfFailure: 3 });
        expect(big).toMatchObject({ transfer: false, ratingAfter: 49 });
    });

    it('fails CLOSED when a test economy is resolved with no roll', () => {
        // A caller error must not hand over the item.
        expect(resolveRequisition(gate(50), { rating: 50 }).transfer).toBe(false);
    });

    it('never transfers when the gate refused', () => {
        const refused = evaluateRequisition('influence', { rating: 90 }, { availability: 'common', bound: true });
        expect(resolveRequisition(refused, { rating: 90 }, { success: true, degreesOfFailure: 0 }).transfer).toBe(false);
    });

    it('debits the pool on a pool economy, without a roll', () => {
        const poolGate = evaluateRequisition('requisition-points', { rating: 0, pool: 10 }, { availability: 'common', cost: 4 });
        expect(resolveRequisition(poolGate, { rating: 0, pool: 10 })).toEqual({ transfer: true, ratingAfter: 0, poolAfter: 6 });
    });

    it('never drives a pool below zero', () => {
        const poolGate = { economy: 'profit-factor' as const, allowed: true, cost: 50 };
        expect(resolveRequisition(poolGate, { rating: 0, pool: 10 }).poolAfter).toBe(0);
    });
});
