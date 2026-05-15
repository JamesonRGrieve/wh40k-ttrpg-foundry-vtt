import { describe, expect, it } from 'vitest';
import { applyInfluenceLossOnBigFailure, AVAILABILITY_MODIFIERS, CRAFTSMANSHIP_MODIFIERS, getRequisitionTestTarget } from './requisition-test';

describe('availability table', () => {
    it('ubiquitous is +30 and unique is −90', () => {
        expect(AVAILABILITY_MODIFIERS.ubiquitous).toBe(30);
        expect(AVAILABILITY_MODIFIERS.unique).toBe(-90);
    });
    it('common and average are both +0', () => {
        expect(AVAILABILITY_MODIFIERS.common).toBe(0);
        expect(AVAILABILITY_MODIFIERS.average).toBe(0);
    });
});

describe('craftsmanship table', () => {
    it('poor is +10, best is −30', () => {
        expect(CRAFTSMANSHIP_MODIFIERS.poor).toBe(10);
        expect(CRAFTSMANSHIP_MODIFIERS.best).toBe(-30);
    });
});

describe('getRequisitionTestTarget', () => {
    it('returns Influence alone when item is Common Common-craft', () => {
        const r = getRequisitionTestTarget({ influence: 40, availability: 'common', craftsmanship: 'common' });
        expect(r.target).toBe(40);
    });

    it('subtracts craftsmanship + availability (clamped at 0)', () => {
        const r = getRequisitionTestTarget({ influence: 40, availability: 'rare', craftsmanship: 'best' });
        // 40 - 20 - 30 = -10, clamped to 0.
        expect(r.target).toBe(0);
    });
    it('higher base influence keeps a residual after both penalties', () => {
        const r = getRequisitionTestTarget({ influence: 80, availability: 'rare', craftsmanship: 'best' });
        expect(r.target).toBe(30);
    });

    it('clamps the target at 0 for a Unique Best item', () => {
        const r = getRequisitionTestTarget({ influence: 30, availability: 'unique', craftsmanship: 'best' });
        expect(r.target).toBe(0);
    });

    it('captures every modifier in the breakdown for chat-card display', () => {
        const r = getRequisitionTestTarget({ influence: 40, availability: 'rare', craftsmanship: 'best', extra: -10 });
        expect(r.breakdown.map((b) => b.label)).toEqual(['Influence', 'Availability (rare)', 'Craftsmanship (best)', 'Other']);
    });
});

describe('applyInfluenceLossOnBigFailure', () => {
    it('drops Influence by 1 when DoF >= 3', () => {
        expect(applyInfluenceLossOnBigFailure(40, 3)).toBe(39);
        expect(applyInfluenceLossOnBigFailure(40, 5)).toBe(39);
    });
    it('does not drop for DoF 0–2', () => {
        expect(applyInfluenceLossOnBigFailure(40, 0)).toBe(40);
        expect(applyInfluenceLossOnBigFailure(40, 2)).toBe(40);
    });
    it('clamps at 0', () => {
        expect(applyInfluenceLossOnBigFailure(0, 5)).toBe(0);
    });
});
