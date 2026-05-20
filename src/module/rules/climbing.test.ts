import { describe, expect, it } from 'vitest';
import { EASY_SURFACE_CLIMB_MODIFIER, SHEER_SURFACE_CLIMB_MODIFIER, STANDARD_SURFACE_CLIMB_MODIFIER, getClimbingModifier } from './climbing';

describe('climbing surface modifiers (errata L113 — Sheer Surfaces)', () => {
    it('pins the sheer-surface modifier at Hard (-20)', () => {
        expect(SHEER_SURFACE_CLIMB_MODIFIER).toBe(-20);
        expect(getClimbingModifier({ surfaceType: 'sheer' })).toBe(-20);
    });

    it('returns zero for a standard climb', () => {
        expect(STANDARD_SURFACE_CLIMB_MODIFIER).toBe(0);
        expect(getClimbingModifier({ surfaceType: 'standard' })).toBe(0);
    });

    it('grants +10 for an easy / assisted climb', () => {
        expect(EASY_SURFACE_CLIMB_MODIFIER).toBe(10);
        expect(getClimbingModifier({ surfaceType: 'easy' })).toBe(10);
    });

    it('keeps the three values distinct so the dropdown maps unambiguously', () => {
        const values = new Set([
            getClimbingModifier({ surfaceType: 'standard' }),
            getClimbingModifier({ surfaceType: 'sheer' }),
            getClimbingModifier({ surfaceType: 'easy' }),
        ]);
        expect(values.size).toBe(3);
    });
});
