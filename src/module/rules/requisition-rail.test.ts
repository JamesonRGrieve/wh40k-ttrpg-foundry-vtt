import { describe, expect, it } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { acquisitionLadderFor } from '../config/game-systems/index.ts';
import { OW_ACQUISITION_LADDER } from '../config/game-systems/ow-config.ts';
import type { AcquisitionLadder } from './acquisition-ladder.ts';
import { computeLogisticsTarget, logisticsContextFor, type LogisticsStanding, type LogisticsTarget, type LogisticsTestTarget } from './ow-logistics.ts';
import { evaluateRequisition, isTestBasedEconomy, type RequisitionGate, requisitionEconomyFor, resolveRequisition } from './requisition-rail.ts';

const dh2 = DH2_ACQUISITION_LADDER;

function ladderOf(line: string): AcquisitionLadder {
    const ladder = acquisitionLadderFor(line);
    if (ladder === null) throw new Error(`no ladder for ${line}`);
    return ladder;
}
function rollable(result: LogisticsTarget): LogisticsTestTarget {
    if (result.kind !== 'test') throw new Error(`expected a rollable test, got ${result.kind}`);
    return result;
}
const DH1_LADDER = ladderOf('dh1');
const BC_LADDER = ladderOf('bc');

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
    it("applies availability and craftsmanship AUTOMATICALLY from the item, from the line's ladder", () => {
        // The old flow made the player hand-type these, so the modifier could
        // disagree with the item actually being acquired.
        const gate = evaluateRequisition('influence', { rating: 60 }, { availability: 'rare', craftsmanship: 'good' }, dh2);
        expect(gate.allowed).toBe(true);
        // DH2: 60 Influence − 20 (Rare) − 20 (Good) = 20
        expect(gate.target).toBe(20);
        expect(gate.breakdown).toEqual([
            { source: 'rating', value: 60 },
            { source: 'availability', value: -20, detail: 'rare' },
            { source: 'craftsmanship', value: -20, detail: 'good' },
        ]);
    });

    it('prices the same item differently per line (#192)', () => {
        // Common: DH2 Ordinary (+10); OW Company-or-Less Challenging (+0) on the default front
        // (3–6 Months twice +0, Violent Impasse −10).
        expect(evaluateRequisition('influence', { rating: 30 }, { availability: 'common' }, dh2).target).toBe(40);
        expect(evaluateRequisition('logistics', { rating: 30 }, { availability: 'common' }, OW_ACQUISITION_LADDER).target).toBe(20);
    });

    it('carries the modifier breakdown, never a lumped total', () => {
        // Roll-transparency: the card must be able to print each component.
        const gate = evaluateRequisition('influence', { rating: 30 }, { availability: 'scarce' }, dh2);
        expect(gate.breakdown?.length).toBe(2);
    });
});

describe('evaluateRequisition — OW prices through the Logistics Test (#496)', () => {
    const standing: LogisticsStanding = {
        rating: 40,
        munitorum: true,
        situational: -5,
        front: { troopCount: 'regiments', timeInFront: 'under3Months', frontActive: 'years5plus', warCondition: 'violentImpasse' },
    };

    it('gives the armoury exactly the target the Logistics Test dialog computes for the same item', () => {
        const item = { availability: 'veryRare' as const, craftsmanship: 'good' as const };
        const gate = evaluateRequisition('logistics', { rating: 40, logistics: standing }, item, OW_ACQUISITION_LADDER);
        const dialog = rollable(computeLogisticsTarget(logisticsContextFor(standing, { ...item, standardKit: false })));
        // 40 + 5 − 5, Very Rare / Multiple Regiments −20, −10 +30 −10, Good −30 = 0
        expect(gate.target).toBe(dialog.target);
        expect(gate.target).toBe(0);
        expect(gate.logistics?.breakdown).toEqual(dialog.breakdown);
    });

    it('uses the troop column, not the line ladder: Ubiquitous with a Single Regiment deployed is Automatic', () => {
        const regiment: LogisticsStanding = { ...standing, front: { ...standing.front, troopCount: 'regiment' } };
        const gate = evaluateRequisition('logistics', { rating: 40, logistics: regiment }, { availability: 'ubiquitous' }, OW_ACQUISITION_LADDER);
        expect(gate).toEqual({ economy: 'logistics', allowed: true, automatic: true });
    });

    it('a Unique item is rollable when Multiple Regiments are deployed (only Company or Less is GM’s Discretion)', () => {
        const gate = evaluateRequisition('logistics', { rating: 90, logistics: standing }, { availability: 'unique' }, OW_ACQUISITION_LADDER);
        expect(gate.allowed).toBe(true);
        expect(gate.logistics?.breakdown.availability).toBe(-50);
    });

    it('never applies the standard-kit +20 the armoury cannot know about', () => {
        const gate = evaluateRequisition('logistics', { rating: 40, logistics: standing }, { availability: 'common' }, OW_ACQUISITION_LADDER);
        expect(gate.logistics?.breakdown.standardKit).toBe(0);
    });

    it('passes a rating the ladder prints "Automatic" with no roll', () => {
        const gate = evaluateRequisition('influence', { rating: 5 }, { availability: 'ubiquitous' }, dh2);
        expect(gate).toEqual({ economy: 'influence', allowed: true, automatic: true });
        expect(resolveRequisition(gate, { rating: 5 })).toEqual({ transfer: true, ratingAfter: 5, poolAfter: undefined });
    });

    it("refuses a rating the ladder leaves to the GM's discretion", () => {
        const gate = evaluateRequisition('logistics', { rating: 90 }, { availability: 'unique' }, OW_ACQUISITION_LADDER);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toEqual({ key: 'WH40K.Requisition.Refusal.Discretion' });
    });

    it('refuses a test economy whose line has no ladder', () => {
        const gate = evaluateRequisition('influence', { rating: 50 }, { availability: 'common' }, null);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toEqual({ key: 'WH40K.Requisition.Refusal.NoEconomy' });
    });

    it('refuses a bound item outright (#390)', () => {
        const gate = evaluateRequisition('influence', { rating: 90 }, { availability: 'common', bound: true }, dh2);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toEqual({ key: 'WH40K.Requisition.Refusal.Bound' });
    });

    it('refuses when the line has no requisition economy', () => {
        const gate = evaluateRequisition('none', { rating: 50 }, { availability: 'common' }, null);
        expect(gate.allowed).toBe(false);
        expect(gate.reason).toEqual({ key: 'WH40K.Requisition.Refusal.NoEconomy' });
    });

    it('gates a pool economy on the pool covering the cost', () => {
        expect(evaluateRequisition('requisition-points', { rating: 0, pool: 10 }, { availability: 'common', cost: 5 }, null).allowed).toBe(true);
        const short = evaluateRequisition('requisition-points', { rating: 0, pool: 3 }, { availability: 'common', cost: 5 }, null);
        expect(short.allowed).toBe(false);
        expect(short.reason).toEqual({ key: 'WH40K.Requisition.Refusal.Pool', data: { cost: 5, pool: 3 } });
    });

    it('gates Deathwatch Requisition on Renown as well as points', () => {
        const item = { availability: 'common' as const, cost: 5, renownRequired: 20 };
        const blocked = evaluateRequisition('requisition-points', { rating: 0, pool: 100, renown: 10 }, item, null);
        expect(blocked.allowed).toBe(false);
        expect(blocked.reason).toEqual({ key: 'WH40K.Requisition.Refusal.Renown', data: { required: 20, renown: 10 } });
        expect(evaluateRequisition('requisition-points', { rating: 0, pool: 100, renown: 40 }, item, null).allowed).toBe(true);
    });
});

describe('resolveRequisition — the outcome', () => {
    const gate = (rating: number): RequisitionGate => evaluateRequisition('influence', { rating }, { availability: 'common' }, dh2);

    it('transfers on a passed test and costs nothing', () => {
        const out = resolveRequisition(gate(50), { rating: 50 }, { success: true, degreesOfFailure: 0 });
        expect(out).toEqual({ transfer: true, ratingAfter: 50, poolAfter: undefined });
    });

    it('DH2: a failure costs the degrees of failure beyond Fellowship bonus (core p. 269)', () => {
        const within = resolveRequisition(gate(50), { rating: 50, fellowshipBonus: 3 }, { success: false, degreesOfFailure: 3 });
        expect(within).toMatchObject({ transfer: false, ratingAfter: 50 });
        const beyond = resolveRequisition(gate(50), { rating: 50, fellowshipBonus: 3 }, { success: false, degreesOfFailure: 5 });
        expect(beyond).toMatchObject({ transfer: false, ratingAfter: 48 });
    });

    it('DH1: a failure by four or more full-ten degrees costs 1 Influence (Ascension p. 16)', () => {
        const dh1Gate = evaluateRequisition('influence', { rating: 40 }, { availability: 'common' }, DH1_LADDER);
        // plusOne DoF 4 = margin 30–39 = three DH1 degrees: no loss.
        expect(resolveRequisition(dh1Gate, { rating: 40 }, { success: false, degreesOfFailure: 4 }).ratingAfter).toBe(40);
        // plusOne DoF 5 = margin 40+ = four DH1 degrees: −1.
        expect(resolveRequisition(dh1Gate, { rating: 40 }, { success: false, degreesOfFailure: 5 }).ratingAfter).toBe(39);
    });

    it('OW and BC: a failure costs no rating, however badly it fails (the books print no loss)', () => {
        const owGate = evaluateRequisition('logistics', { rating: 40 }, { availability: 'common' }, OW_ACQUISITION_LADDER);
        expect(resolveRequisition(owGate, { rating: 40 }, { success: false, degreesOfFailure: 9 })).toMatchObject({ transfer: false, ratingAfter: 40 });
        const bcGate = evaluateRequisition('infamy', { rating: 40 }, { availability: 'common' }, BC_LADDER);
        expect(resolveRequisition(bcGate, { rating: 40 }, { success: false, degreesOfFailure: 9 })).toMatchObject({ transfer: false, ratingAfter: 40 });
    });

    it('fails CLOSED when a test economy is resolved with no roll', () => {
        // A caller error must not hand over the item.
        expect(resolveRequisition(gate(50), { rating: 50 }).transfer).toBe(false);
    });

    it('never transfers when the gate refused', () => {
        const refused = evaluateRequisition('influence', { rating: 90 }, { availability: 'common', bound: true }, dh2);
        expect(resolveRequisition(refused, { rating: 90 }, { success: true, degreesOfFailure: 0 }).transfer).toBe(false);
    });

    it('debits the pool on a pool economy, without a roll', () => {
        const poolGate = evaluateRequisition('requisition-points', { rating: 0, pool: 10 }, { availability: 'common', cost: 4 }, null);
        expect(resolveRequisition(poolGate, { rating: 0, pool: 10 })).toEqual({ transfer: true, ratingAfter: 0, poolAfter: 6 });
    });

    it('never drives a pool below zero', () => {
        const poolGate = { economy: 'profit-factor' as const, allowed: true, cost: 50 };
        expect(resolveRequisition(poolGate, { rating: 0, pool: 10 }).poolAfter).toBe(0);
    });
});
