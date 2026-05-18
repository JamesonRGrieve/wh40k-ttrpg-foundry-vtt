import { describe, expect, it } from 'vitest';
import {
    AVAILABILITY_REPAIR_MODIFIER,
    XENOS_CONDITION_THRESHOLDS,
    getXenosCondition,
    nextConditionUp,
    resolveXenosRepairTarget,
    tickXenosDegradation,
} from './xenos-equipment';

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
        const r = resolveXenosRepairTarget({ techUseTotal: 40, availability: 'rare', currentCondition: 'pristine' });
        expect(r).toEqual({ target: 40, isNoOp: true, requiresFacility: false });
    });

    it('applies the Availability modifier for non-pristine repair attempts', () => {
        // worn + rare (-20) → 40 - 20 = 20
        const r = resolveXenosRepairTarget({ techUseTotal: 40, availability: 'rare', currentCondition: 'worn' });
        expect(r.target).toBe(20);
        expect(r.isNoOp).toBe(false);
        expect(r.requiresFacility).toBe(false);
    });

    it('flags requiresFacility when the item is ruined', () => {
        const r = resolveXenosRepairTarget({ techUseTotal: 40, availability: 'common', currentCondition: 'ruined' });
        expect(r.requiresFacility).toBe(true);
    });

    it('floors the target at 0', () => {
        const r = resolveXenosRepairTarget({ techUseTotal: 10, availability: 'unique', currentCondition: 'degraded' });
        // 10 + (-90) → floored to 0
        expect(r.target).toBe(0);
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

describe('AVAILABILITY_REPAIR_MODIFIER (#136)', () => {
    it('is re-exported from requisition-test.ts (single source of truth)', () => {
        // Common-spec sanity check: should carry the canonical key set.
        expect(AVAILABILITY_REPAIR_MODIFIER.scarce).toBe(-10);
        expect(AVAILABILITY_REPAIR_MODIFIER.unique).toBe(-90);
    });

    it('thresholds table is exposed (sheet-display convenience)', () => {
        expect(XENOS_CONDITION_THRESHOLDS.pristine.minCharges).toBe(8);
        expect(XENOS_CONDITION_THRESHOLDS.ruined.minCharges).toBe(0);
    });
});
