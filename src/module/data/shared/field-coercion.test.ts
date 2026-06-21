import { describe, expect, it } from 'vitest';
import { clampSize, coerceIntFields, SIZE_NAME_MAP, sizeNameToInt } from './field-coercion.ts';
import type { RawSource } from './raw-source.ts';

describe('clampSize', () => {
    it('clamps below 1 up to 1 and above 10 down to 10', () => {
        expect(clampSize(0)).toBe(1);
        expect(clampSize(-5)).toBe(1);
        expect(clampSize(11)).toBe(10);
        expect(clampSize(99)).toBe(10);
    });

    it('passes in-band values through unchanged', () => {
        for (let n = 1; n <= 10; n++) expect(clampSize(n)).toBe(n);
    });
});

describe('SIZE_NAME_MAP / sizeNameToInt', () => {
    it('maps every legacy size name to its band', () => {
        expect(SIZE_NAME_MAP).toEqual({
            miniscule: 1,
            puny: 2,
            scrawny: 3,
            average: 4,
            hulking: 5,
            enormous: 6,
            massive: 7,
            immense: 8,
        });
    });

    it('resolves names case-insensitively', () => {
        expect(sizeNameToInt('Miniscule')).toBe(1);
        expect(sizeNameToInt('IMMENSE')).toBe(8);
        expect(sizeNameToInt('hulking')).toBe(5);
    });

    it('defaults an unknown name to average (4)', () => {
        expect(sizeNameToInt('gigantic')).toBe(4);
        expect(sizeNameToInt('')).toBe(4);
    });
});

describe('coerceIntFields', () => {
    it('coerces only the listed defined fields, in place', () => {
        const obj: RawSource = { max: '10', value: 3.9, critical: undefined, other: 'x' };
        coerceIntFields(obj, ['max', 'value', 'critical']);
        expect(obj).toEqual({ max: 10, value: 3, critical: undefined, other: 'x' });
    });

    it('applies per-field defaults for non-numeric / empty values', () => {
        const obj: RawSource = { max: '', value: 'abc', critical: null };
        coerceIntFields(obj, ['max', 'value', 'critical'], { max: 10, value: 10, critical: 0 });
        expect(obj).toEqual({ max: 10, value: 10, critical: 0 });
    });

    it('falls back to 0 when no default is given for a field', () => {
        const obj: RawSource = { rating: 'nope' };
        coerceIntFields(obj, ['rating']);
        expect(obj['rating']).toBe(0);
    });

    it('leaves undefined fields untouched (no key materialised)', () => {
        const obj: RawSource = {};
        coerceIntFields(obj, ['max', 'value'], { max: 10 });
        expect('max' in obj).toBe(false);
        expect('value' in obj).toBe(false);
    });
});
