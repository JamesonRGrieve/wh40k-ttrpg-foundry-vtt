import { describe, expect, it } from 'vitest';
import { nonNegDistance, nonNegFinite, nonNegInt } from './_num.ts';

describe('nonNegInt (#301)', () => {
    it('truncates fractions toward zero', () => {
        expect(nonNegInt(3.9)).toBe(3);
        expect(nonNegInt(0.4)).toBe(0);
    });

    it('clamps negatives to 0', () => {
        expect(nonNegInt(-1)).toBe(0);
        expect(nonNegInt(-0.5)).toBe(0);
    });

    it('maps non-finite input to 0', () => {
        expect(nonNegInt(Number.NaN)).toBe(0);
        expect(nonNegInt(Number.POSITIVE_INFINITY)).toBe(0);
        expect(nonNegInt(Number.NEGATIVE_INFINITY)).toBe(0);
    });

    it('passes through non-negative integers', () => {
        expect(nonNegInt(0)).toBe(0);
        expect(nonNegInt(42)).toBe(42);
    });
});

describe('nonNegFinite / nonNegDistance (#301)', () => {
    it('preserves fractional magnitude', () => {
        expect(nonNegFinite(3.5)).toBe(3.5);
        expect(nonNegDistance(2.25)).toBe(2.25);
    });

    it('clamps negatives to 0 and maps non-finite to 0', () => {
        expect(nonNegFinite(-2.5)).toBe(0);
        expect(nonNegFinite(Number.NaN)).toBe(0);
        expect(nonNegDistance(Number.POSITIVE_INFINITY)).toBe(0);
    });
});
