import { describe, expect, it } from 'vitest';
import { coerceInt } from './coerce.ts';

describe('coerceInt (#271)', () => {
    it('floors numeric strings and numbers', () => {
        expect(coerceInt('42')).toBe(42);
        expect(coerceInt('3.9')).toBe(3);
        expect(coerceInt(9.9)).toBe(9);
    });

    it('uses the fallback for null / undefined / empty / non-numeric', () => {
        expect(coerceInt(null, 7)).toBe(7);
        expect(coerceInt(undefined, 7)).toBe(7);
        expect(coerceInt('', 7)).toBe(7);
        expect(coerceInt('not-a-number', 7)).toBe(7);
        expect(coerceInt(null)).toBe(0);
    });
});
