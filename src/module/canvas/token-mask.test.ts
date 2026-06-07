import { describe, expect, it } from 'vitest';
import { computeFrameTransform, parseTokenFrameFlag } from './token-mask.ts';

describe('computeFrameTransform', () => {
    it('spans the content circle with the short side of portrait art', () => {
        // 400x800 portrait into a 512 frame at 75% content: short side 400
        // must scale to 384 (512 * 0.75)
        const t = computeFrameTransform(400, 800, 512, 0.75, 0.5, 0.3);
        expect(t.scale).toBeCloseTo(384 / 400);
        expect(t.radius).toBe(192);
    });

    it('places the requested centre point at the frame centre', () => {
        const t = computeFrameTransform(400, 800, 512, 0.75, 0.5, 0.3);
        // source point (cx*w, cy*h) scaled and offset must land on (256, 256)
        expect(0.5 * 400 * t.scale + t.x).toBeCloseTo(256);
        expect(0.3 * 800 * t.scale + t.y).toBeCloseTo(256);
    });

    it('handles landscape art via the short side', () => {
        const t = computeFrameTransform(900, 300, 512, 1.0, 0.5, 0.5);
        expect(t.scale).toBeCloseTo(512 / 300);
        expect(t.radius).toBe(256);
        expect(0.5 * 300 * t.scale + t.y).toBeCloseTo(256);
    });

    it('is centred for square art with default-style coordinates', () => {
        const t = computeFrameTransform(512, 512, 512, 0.75, 0.5, 0.5);
        expect(t.x).toBeCloseTo(256 - 0.5 * 512 * t.scale);
        expect(0.5 * 512 * t.scale + t.x).toBeCloseTo(256);
    });
});

describe('parseTokenFrameFlag', () => {
    it('returns null for absent or disabled flags', () => {
        expect(parseTokenFrameFlag(undefined)).toBeNull();
        expect(parseTokenFrameFlag(null)).toBeNull();
        expect(parseTokenFrameFlag(false)).toBeNull();
    });

    it('fills head-biased defaults for a bare enable', () => {
        expect(parseTokenFrameFlag(true)).toEqual({ cx: 0.5, cy: 0.3, content: 0 });
        expect(parseTokenFrameFlag({})).toEqual({ cx: 0.5, cy: 0.3, content: 0 });
    });

    it('keeps explicit coordinates and clamps out-of-range values', () => {
        expect(parseTokenFrameFlag({ cx: 0.7, cy: 0.2, content: 0.8 })).toEqual({ cx: 0.7, cy: 0.2, content: 0.8 });
        expect(parseTokenFrameFlag({ cx: 4, cy: -1 })).toEqual({ cx: 1, cy: 0, content: 0 });
    });

    it('ignores non-finite garbage', () => {
        expect(parseTokenFrameFlag({ cx: Number.NaN, cy: Number.POSITIVE_INFINITY })).toEqual({
            cx: 0.5,
            cy: 0.3,
            content: 0,
        });
    });
});
