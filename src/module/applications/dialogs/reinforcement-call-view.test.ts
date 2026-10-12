import { describe, expect, it } from 'vitest';
import { buildReinforcementCallView, fixedPeerDiscount, type ReinforcementTerms } from './reinforcement-call-view';

// Sister of Battle Canoness (DH2 core p. 296): minimum 50, cost 5, Peer (Adepta Sororitas) −2.
const CANONESS: ReinforcementTerms = { influenceMinimum: 50, influenceCost: 5, peerDiscount: { peer: 'Adepta Sororitas', amount: '2' } };

const WARBAND = [
    { id: 'ibnad', name: 'Ibnad', influence: 55 },
    { id: 'magnus', name: 'Magnus', influence: 30 },
    { id: 'gus', name: 'Gus', influence: 20 },
];

describe('fixedPeerDiscount', () => {
    it('reads a plain number and leaves a dice formula to roll', () => {
        expect(fixedPeerDiscount('2')).toBe(2);
        expect(fixedPeerDiscount(' 2 ')).toBe(2);
        expect(fixedPeerDiscount('1d5')).toBeNull();
        expect(fixedPeerDiscount('')).toBeNull();
    });
});

describe('buildReinforcementCallView (#77)', () => {
    it('plans a call with a contribution and the Peer discount', () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'ibnad', contributions: { magnus: 2 }, peerDiscount: 2, gmAdjustment: 1 });
        expect(view.finalCost).toBe(4);
        expect(view.contributionCap).toBe(2);
        expect(view.problemKey).toBe('');
        expect(view.result).toEqual({ ok: true, plan: { finalCost: 4, callerPays: 2, contributions: [{ id: 'magnus', amount: 2 }], subtletyLoss: 4 } });
        expect(view.rows.map((r) => [r.id, r.isCaller, r.meetsMinimum])).toEqual([
            ['ibnad', true, true],
            ['magnus', false, false],
            ['gus', false, false],
        ]);
    });
    it("ignores the caller's own contribution entry", () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'ibnad', contributions: { ibnad: 5 }, peerDiscount: 0, gmAdjustment: 0 });
        expect(view.rows.find((r) => r.id === 'ibnad')?.contribution).toBe(0);
        expect(view.result).toMatchObject({ ok: true, plan: { callerPays: 5 } });
    });
    it('reports a caller below the Influence Minimum', () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'magnus', contributions: {}, peerDiscount: 0, gmAdjustment: 0 });
        expect(view.problemKey).toBe('WH40K.Reinforcement.Problem.belowMinimum');
    });
    it('reports an over-cap contribution', () => {
        const view = buildReinforcementCallView(CANONESS, WARBAND, {
            callerId: 'ibnad',
            contributions: { magnus: 2, gus: 2 },
            peerDiscount: 0,
            gmAdjustment: 0,
        });
        expect(view.problemKey).toBe('WH40K.Reinforcement.Problem.contributionCap');
    });
    it('blocks an NPC with no printed terms, and a missing caller', () => {
        const none: ReinforcementTerms = { influenceMinimum: null, influenceCost: null, peerDiscount: { peer: '', amount: '' } };
        expect(buildReinforcementCallView(none, WARBAND, { callerId: 'ibnad', contributions: {}, peerDiscount: 0, gmAdjustment: 0 }).problemKey).toBe(
            'WH40K.Reinforcement.Problem.noTerms',
        );
        expect(buildReinforcementCallView(CANONESS, WARBAND, { callerId: 'nobody', contributions: {}, peerDiscount: 0, gmAdjustment: 0 }).problemKey).toBe(
            'WH40K.Reinforcement.Problem.noCaller',
        );
    });
});
