/**
 * Unit coverage for the pure stacked-token-picker geometry / ordering (#569).
 * The canvas hook that draws the palette is a thin shell over these; the logic
 * that decides WHICH tokens stack, in WHAT order, and WHERE the palette sits is
 * all here and fully testable without a live canvas.
 */

import { describe, expect, it } from 'vitest';
import {
    bustObjectPosition,
    computePalettePlacement,
    detectStackAt,
    isStack,
    orderStack,
    raiseToTopSort,
    type Rect,
    type StackTokenLike,
} from './stacked-token-picker.ts';

const tok = (over: Partial<StackTokenLike> & { id: string }): StackTokenLike => ({
    id: over.id,
    name: over.name ?? over.id,
    elevation: over.elevation ?? 0,
    sort: over.sort ?? 0,
    bounds: over.bounds ?? { x: 0, y: 0, width: 100, height: 100 },
    img: over.img ?? `${over.id}.webp`,
    selectable: over.selectable ?? true,
});

describe('detectStackAt', () => {
    it('returns every selectable token whose bounds contain the point', () => {
        const a = tok({ id: 'a', bounds: { x: 0, y: 0, width: 100, height: 100 } });
        const b = tok({ id: 'b', bounds: { x: 50, y: 50, width: 100, height: 100 } });
        const c = tok({ id: 'c', bounds: { x: 300, y: 300, width: 50, height: 50 } });
        const stack = detectStackAt([a, b, c], { x: 60, y: 60 });
        expect(stack.map((t) => t.id).sort()).toEqual(['a', 'b']);
    });

    it('excludes tokens the user cannot select (ownership / visibility)', () => {
        const a = tok({ id: 'a' });
        const hidden = tok({ id: 'hidden', selectable: false });
        expect(detectStackAt([a, hidden], { x: 10, y: 10 }).map((t) => t.id)).toEqual(['a']);
    });

    it('includes edge points (inclusive bounds) and excludes points outside', () => {
        const a = tok({ id: 'a', bounds: { x: 0, y: 0, width: 100, height: 100 } });
        expect(detectStackAt([a], { x: 100, y: 100 }).map((t) => t.id)).toEqual(['a']);
        expect(detectStackAt([a], { x: 101, y: 50 })).toEqual([]);
    });
});

describe('isStack', () => {
    it('is true only for two or more tokens', () => {
        expect(isStack([])).toBe(false);
        expect(isStack([tok({ id: 'a' })])).toBe(false);
        expect(isStack([tok({ id: 'a' }), tok({ id: 'b' })])).toBe(true);
    });
});

describe('orderStack', () => {
    it('orders by elevation (highest first), then name, then id — a total, stable order', () => {
        const stack = [
            tok({ id: 'z', name: 'Ganger', elevation: 0 }),
            tok({ id: 'a', name: 'Ganger', elevation: 0 }),
            tok({ id: 'high', name: 'Boss', elevation: 10 }),
            tok({ id: 'm', name: 'Aviator', elevation: 0 }),
        ];
        expect(orderStack(stack).map((t) => t.id)).toEqual(['high', 'm', 'a', 'z']);
    });

    it('does not reshuffle identical same-name same-elevation tokens between calls (id tiebreak)', () => {
        const stack = [tok({ id: 'g3', name: 'Ganger' }), tok({ id: 'g1', name: 'Ganger' }), tok({ id: 'g2', name: 'Ganger' })];
        expect(orderStack(stack).map((t) => t.id)).toEqual(['g1', 'g2', 'g3']);
        expect(orderStack(orderStack(stack)).map((t) => t.id)).toEqual(['g1', 'g2', 'g3']);
    });

    it('does not mutate its input', () => {
        const stack = [tok({ id: 'b' }), tok({ id: 'a' })];
        orderStack(stack);
        expect(stack.map((t) => t.id)).toEqual(['b', 'a']);
    });
});

describe('raiseToTopSort', () => {
    it('returns one above the highest other sort, so the clicked token renders on top', () => {
        const stack = [tok({ id: 'a', sort: 0 }), tok({ id: 'b', sort: 5 }), tok({ id: 'c', sort: 3 })];
        expect(raiseToTopSort(stack, 'a')).toBe(6);
        expect(raiseToTopSort(stack, 'c')).toBe(6);
    });

    it('returns null when the token is already strictly on top (nothing to reorder)', () => {
        const stack = [tok({ id: 'a', sort: 0 }), tok({ id: 'b', sort: 9 })];
        expect(raiseToTopSort(stack, 'b')).toBeNull();
    });

    it('raises a token tied for the top so it wins the tie', () => {
        const stack = [tok({ id: 'a', sort: 4 }), tok({ id: 'b', sort: 4 })];
        expect(raiseToTopSort(stack, 'a')).toBe(5);
    });

    it('returns null for a token not in the stack, or a lone token', () => {
        const stack = [tok({ id: 'a', sort: 1 }), tok({ id: 'b', sort: 2 })];
        expect(raiseToTopSort(stack, 'missing')).toBeNull();
        expect(raiseToTopSort([tok({ id: 'solo', sort: 0 })], 'solo')).toBeNull();
    });

    it('treats a missing sort as 0', () => {
        const stack = [tok({ id: 'a' }), tok({ id: 'b' })];
        expect(raiseToTopSort(stack, 'a')).toBe(1);
    });
});

describe('computePalettePlacement', () => {
    const viewport: Rect = { x: 0, y: 0, width: 1000, height: 800 };
    const palette = { width: 120, height: 200 };

    it('places the palette to the LEFT of the anchor by default', () => {
        const p = computePalettePlacement({ x: 500, y: 300, width: 100, height: 100 }, palette, viewport);
        expect(p.side).toBe('left');
        expect(p.x).toBe(500 - 8 - 120);
        expect(p.y).toBe(300);
    });

    it('flips to the RIGHT when the left placement would clip the viewport edge', () => {
        const p = computePalettePlacement({ x: 10, y: 300, width: 100, height: 100 }, palette, viewport);
        expect(p.side).toBe('right');
        expect(p.x).toBe(10 + 100 + 8);
    });

    it('clamps the top edge so the whole palette stays vertically in view', () => {
        const p = computePalettePlacement({ x: 500, y: 750, width: 100, height: 100 }, palette, viewport);
        // anchor.y 750 + palette 200 would overflow 800 → clamp to 600.
        expect(p.y).toBe(600);
    });

    it('pins a palette wider/taller than the viewport to the top-left rather than off-screen', () => {
        const huge = { width: 2000, height: 2000 };
        const p = computePalettePlacement({ x: 5, y: 5, width: 50, height: 50 }, huge, viewport);
        expect(p.x).toBe(0);
        expect(p.y).toBe(0);
    });
});

describe('bustObjectPosition', () => {
    it('maps a frame centre to CSS object-position percentages', () => {
        expect(bustObjectPosition({ cx: 0.5, cy: 0.3 })).toBe('50% 30%');
    });

    it('centres a null frame (or null components)', () => {
        expect(bustObjectPosition(null)).toBe('50% 50%');
        expect(bustObjectPosition({ cx: null, cy: null })).toBe('50% 50%');
    });

    it('clamps out-of-range fractions into 0–100%', () => {
        expect(bustObjectPosition({ cx: 1.5, cy: -0.2 })).toBe('100% 0%');
    });
});
