import { describe, expect, it } from 'vitest';
import { choosePortrait, effectivePortraitPool, type PortraitVariant } from './portrait-pool.ts';

const v = (img: string, cx: number | null = null, cy: number | null = null): PortraitVariant => ({ img, tokenFrame: { cx, cy } });

/** A deterministic RNG returning a fixed sequence, then repeating the last. */
function rngOf(...values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

describe('effectivePortraitPool', () => {
    it('prepends a non-blank default before the variants', () => {
        const pool = effectivePortraitPool(v('a.webp', 0.5, 0.3), [v('b.webp'), v('c.webp')]);
        expect(pool.map((p) => p.img)).toEqual(['a.webp', 'b.webp', 'c.webp']);
        expect(pool[0]?.tokenFrame).toEqual({ cx: 0.5, cy: 0.3 });
    });

    it('drops a null/blank default', () => {
        expect(effectivePortraitPool(null, [v('b.webp')]).map((p) => p.img)).toEqual(['b.webp']);
        expect(effectivePortraitPool(v('  '), [v('b.webp')]).map((p) => p.img)).toEqual(['b.webp']);
    });

    it('drops blank variant images', () => {
        const pool = effectivePortraitPool(v('a.webp'), [v(''), v('b.webp'), { img: '  ', tokenFrame: null }]);
        expect(pool.map((p) => p.img)).toEqual(['a.webp', 'b.webp']);
    });

    it('handles a null/undefined variants list', () => {
        expect(effectivePortraitPool(v('a.webp'), null).map((p) => p.img)).toEqual(['a.webp']);
        expect(effectivePortraitPool(v('a.webp'), undefined).map((p) => p.img)).toEqual(['a.webp']);
    });
});

describe('choosePortrait', () => {
    const pool = [v('a.webp'), v('b.webp'), v('c.webp')];

    it('returns null when there is nothing to vary', () => {
        expect(choosePortrait([], null)).toBeNull();
        expect(choosePortrait([v('only.webp')], null)).toBeNull();
    });

    it('honours a valid pinned index over the RNG', () => {
        expect(choosePortrait(pool, 2, rngOf(0))?.img).toBe('c.webp');
        expect(choosePortrait(pool, 0, rngOf(0.99))?.img).toBe('a.webp');
        // Pin works even on a single-entry pool.
        expect(choosePortrait([v('only.webp')], 0)?.img).toBe('only.webp');
    });

    it('falls back to random when the pin is out of range or negative', () => {
        expect(choosePortrait(pool, 9, rngOf(0))?.img).toBe('a.webp');
        expect(choosePortrait(pool, -1, rngOf(0.5))?.img).toBe('b.webp');
    });

    it('maps the RNG uniformly across indices', () => {
        expect(choosePortrait(pool, null, rngOf(0))?.img).toBe('a.webp');
        expect(choosePortrait(pool, null, rngOf(0.34))?.img).toBe('b.webp');
        expect(choosePortrait(pool, null, rngOf(0.67))?.img).toBe('c.webp');
        // Clamp the degenerate rng() === 1 case to the last index.
        expect(choosePortrait(pool, null, rngOf(1))?.img).toBe('c.webp');
    });

    it('two draws of the same pool can differ (variety)', () => {
        const first = choosePortrait(pool, null, rngOf(0))?.img;
        const second = choosePortrait(pool, null, rngOf(0.67))?.img;
        expect(first).not.toBe(second);
    });
});
