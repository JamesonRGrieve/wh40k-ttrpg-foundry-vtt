import { describe, expect, it } from 'vitest';
import { capitalize, formatSigned } from './format.ts';

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

describe('capitalize (#358)', () => {
    it('upper-cases only the first character', () => {
        expect(capitalize('hello')).toBe('Hello');
        expect(capitalize('weaponSkill')).toBe('WeaponSkill');
    });

    it('leaves the remainder of the string untouched (no lower-casing)', () => {
        expect(capitalize('hELLO')).toBe('HELLO');
        expect(capitalize('ABC')).toBe('ABC');
    });

    it('returns an empty string unchanged', () => {
        expect(capitalize('')).toBe('');
    });

    it('handles single-character and non-letter leads', () => {
        expect(capitalize('a')).toBe('A');
        expect(capitalize('1abc')).toBe('1abc');
    });
});
