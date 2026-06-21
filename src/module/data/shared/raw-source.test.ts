/**
 * Unit tests for the shared raw-source narrowing helper.
 */
import { describe, expect, it } from 'vitest';
import { asRawSource, type RawSource } from './raw-source.ts';

describe('asRawSource', () => {
    it('returns the value as a RawSource for a plain object', () => {
        const nested = { a: 1, b: 'x' };
        const source: RawSource = { child: nested };
        expect(asRawSource(source['child'])).toBe(nested);
    });

    it('returns an empty-object reference unchanged', () => {
        const empty = {};
        expect(asRawSource(empty)).toBe(empty);
    });

    it('returns null for null', () => {
        expect(asRawSource(null)).toBeNull();
    });

    it('returns null for undefined', () => {
        expect(asRawSource(undefined)).toBeNull();
    });

    it('returns null for an array (arrays are not source bags)', () => {
        expect(asRawSource([1, 2, 3])).toBeNull();
    });

    it.each([42, 'string', true])('returns null for the primitive %p', (primitive) => {
        expect(asRawSource(primitive)).toBeNull();
    });
});
