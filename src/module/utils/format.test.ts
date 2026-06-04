import { describe, expect, it } from 'vitest';
import { formatSigned } from './format.ts';

describe('formatSigned (#280)', () => {
    it('prefixes positive numbers with +', () => {
        expect(formatSigned(5)).toBe('+5');
        expect(formatSigned(1)).toBe('+1');
        expect(formatSigned(60)).toBe('+60');
    });

    it('renders zero as +0 (matching the legacy signedNumber helper)', () => {
        expect(formatSigned(0)).toBe('+0');
    });

    it('keeps the native minus sign for negatives', () => {
        expect(formatSigned(-3)).toBe('-3');
        expect(formatSigned(-12)).toBe('-12');
    });

    it('treats non-finite input as 0 → +0 (matching signedNumber)', () => {
        expect(formatSigned(Number.NaN)).toBe('+0');
        expect(formatSigned(Number.POSITIVE_INFINITY)).toBe('+0');
        expect(formatSigned(Number.NEGATIVE_INFINITY)).toBe('+0');
    });

    it('preserves fractional values', () => {
        expect(formatSigned(2.5)).toBe('+2.5');
        expect(formatSigned(-0.5)).toBe('-0.5');
    });
});
