import { describe, expect, it } from 'vitest';
import { MAX_SIZE, MIN_SIZE, targetSizeModifier } from './target-size';

/**
 * Tests for the shared target-size to-hit SSOT (DH2 Table 4-6, p.138).
 *
 * The formula was previously encoded twice, and a 7-row table that stopped at
 * Size 7 gave Size 8–10 targets +30 instead of +40/+50/+60 (#421). These tests
 * pin the full 1–10 ladder.
 */
describe('targetSizeModifier (Table 4-6 SSOT, #421)', () => {
    it('returns 0 for an Average (4) target', () => {
        expect(targetSizeModifier(4)).toBe(0);
    });

    it('pins the full RAW ladder for sizes 1–10', () => {
        expect(targetSizeModifier(1)).toBe(-30); // Minuscule
        expect(targetSizeModifier(2)).toBe(-20); // Puny
        expect(targetSizeModifier(3)).toBe(-10); // Scrawny
        expect(targetSizeModifier(4)).toBe(0); // Average
        expect(targetSizeModifier(5)).toBe(10); // Hulking
        expect(targetSizeModifier(6)).toBe(20); // Enormous
        expect(targetSizeModifier(7)).toBe(30); // Massive
        expect(targetSizeModifier(8)).toBe(40); // Immense
        expect(targetSizeModifier(9)).toBe(50); // Monumental
        expect(targetSizeModifier(10)).toBe(60); // Titanic
    });

    it('gives Size 8–10 the +40/+50/+60 the auto-modifier already used (was +30 in the old table)', () => {
        expect(targetSizeModifier(8)).toBe(40);
        expect(targetSizeModifier(9)).toBe(50);
        expect(targetSizeModifier(10)).toBe(60);
    });

    it('clamps out-of-range sizes to the RAW extremes rather than extrapolating', () => {
        expect(targetSizeModifier(0)).toBe(targetSizeModifier(MIN_SIZE));
        expect(targetSizeModifier(-5)).toBe(-30);
        expect(targetSizeModifier(11)).toBe(targetSizeModifier(MAX_SIZE));
        expect(targetSizeModifier(99)).toBe(60);
    });

    it('propagates a non-numeric size as NaN (matches pre-SSOT call-site behaviour)', () => {
        expect(Number.isNaN(targetSizeModifier(Number.NaN))).toBe(true);
    });
});
