import { describe, expect, it } from 'vitest';
import { DH2_ACQUISITION_LADDER } from '../config/game-systems/dh2-config.ts';
import { XENOS_CONDITION_THRESHOLDS, getXenosCondition, nextConditionUp, resolveXenosRepairTarget, tickXenosDegradation } from './xenos-equipment';

const ladder = DH2_ACQUISITION_LADDER;

describe('getXenosCondition (#136)', () => {
    it('pristine ≥ 8 charges', () => {
        expect(getXenosCondition(8)).toBe('pristine');
        expect(getXenosCondition(20)).toBe('pristine');
    });
    it('worn at 4–7 charges', () => {
        expect(getXenosCondition(7)).toBe('worn');
        expect(getXenosCondition(4)).toBe('worn');
    });
    it('degraded at 1–3 charges', () => {
        expect(getXenosCondition(3)).toBe('degraded');
        expect(getXenosCondition(1)).toBe('degraded');
    });
    it('ruined at 0 or negative or non-finite', () => {
        expect(getXenosCondition(0)).toBe('ruined');
        expect(getXenosCondition(-5)).toBe('ruined');
        expect(getXenosCondition(Number.NaN)).toBe('ruined');
    });
});

describe('tickXenosDegradation (#136)', () => {
    it('decrements by 1 by default and reports new condition', () => {
        expect(tickXenosDegradation(8)).toEqual({ newCharges: 7, newCondition: 'worn' });
        expect(tickXenosDegradation(2)).toEqual({ newCharges: 1, newCondition: 'degraded' });
        expect(tickXenosDegradation(1)).toEqual({ newCharges: 0, newCondition: 'ruined' });
    });
    it('honours an explicit tick count', () => {
        expect(tickXenosDegradation(10, 3)).toEqual({ newCharges: 7, newCondition: 'worn' });
    });
    it('floors at 0', () => {
        expect(tickXenosDegradation(3, 10)).toEqual({ newCharges: 0, newCondition: 'ruined' });
    });
});

describe('resolveXenosRepairTarget (#136)', () => {
    it('returns the techUseTotal unchanged when pristine (no-op)', () => {
        const r = resolveXenosRepairTarget({ techUseTotal: 40, ladder, availability: 'rare', currentCondition: 'pristine' });
        expect(r).toEqual({ target: 40, isNoOp: true, requiresFacility: false });
    });

    it("applies the line ladder's Availability modifier for non-pristine repair attempts (#192)", () => {
        // DH2: worn + Rare (−20) → 40 − 20 = 20
        const r = resolveXenosRepairTarget({ techUseTotal: 40, ladder, availability: 'rare', currentCondition: 'worn' });
        expect(r.target).toBe(20);
        expect(r.isNoOp).toBe(false);
        expect(r.requiresFacility).toBe(false);
    });

    it('flags requiresFacility when the item is ruined', () => {
        const r = resolveXenosRepairTarget({ techUseTotal: 40, ladder, availability: 'common', currentCondition: 'ruined' });
        expect(r.requiresFacility).toBe(true);
    });

    it('floors the target at 0', () => {
        // DH2: 10 + (−60, Unique) → floored to 0
        const r = resolveXenosRepairTarget({ techUseTotal: 10, ladder, availability: 'unique', currentCondition: 'degraded' });
        expect(r.target).toBe(0);
    });

    it('derives no target for a rating the ladder prints without a number', () => {
        const r = resolveXenosRepairTarget({ techUseTotal: 40, ladder, availability: 'ubiquitous', currentCondition: 'worn' });
        expect(r.target).toBeNull();
    });
});

describe('nextConditionUp (#136)', () => {
    it('ladder: ruined → degraded → worn → pristine', () => {
        expect(nextConditionUp('ruined')).toBe('degraded');
        expect(nextConditionUp('degraded')).toBe('worn');
        expect(nextConditionUp('worn')).toBe('pristine');
    });
    it('pristine stays pristine (cap)', () => {
        expect(nextConditionUp('pristine')).toBe('pristine');
    });
});

describe('XENOS_CONDITION_THRESHOLDS (#136)', () => {
    it('thresholds table is exposed (sheet-display convenience)', () => {
        expect(XENOS_CONDITION_THRESHOLDS.pristine.minCharges).toBe(8);
        expect(XENOS_CONDITION_THRESHOLDS.ruined.minCharges).toBe(0);
    });
});
