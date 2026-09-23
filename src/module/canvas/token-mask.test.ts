import { describe, expect, it } from 'vitest';
import { computeFrameTransform, type FrameFlagSource, parseTokenFrameFlag, resolveBustContent, resolveTokenFrameFlag } from './token-mask.ts';

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

describe('computeFrameTransform content-circle coverage (#501)', () => {
    /** Does the scaled source span the whole content circle on both axes? */
    const covers = (t: { scale: number; x: number; y: number; radius: number }, w: number, h: number, size: number): boolean => {
        const min = size / 2 - t.radius;
        const max = size / 2 + t.radius;
        return t.x <= min && t.x + w * t.scale >= max && t.y <= min && t.y + h * t.scale >= max;
    };

    it.each([
        // The four live aberrants: two 1.83 landscape, two 0.56 portrait.
        ['aberrant-assassin', 1024, 559, 0.51, 0.335, 1.644],
        ['aberrant-melee', 1024, 559, 0.5, 0.4, 1.251],
        ['aberrant-hybrid', 572, 1024, 0.499, 0.223, 1.252],
        ['aberrant-ranged', 572, 1024, 0.48, 0.34, 1.8],
    ])('covers the circle for non-square source %s', (_name, w, h, cx, cy, zoom) => {
        const t = computeFrameTransform(w, h, 512, 0.75, cx, cy, zoom);
        expect(covers(t, w, h, 512)).toBe(true);
    });

    it('clamps an extreme centre rather than leaving an arc of the circle transparent', () => {
        // cy 0.02 on landscape art would slide the source down and uncover the
        // top of the bust; the clamp pins it so the circle stays covered.
        const w = 1024;
        const h = 559;
        const t = computeFrameTransform(w, h, 512, 0.75, 0.5, 0.02, 1.1);
        expect(covers(t, w, h, 512)).toBe(true);
    });

    it('honours the requested centre exactly when it already covers the circle', () => {
        // A well-framed portrait must not be nudged by the clamp.
        const t = computeFrameTransform(512, 512, 512, 0.75, 0.5, 0.303, 1.803);
        expect(0.5 * 512 * t.scale + t.x).toBeCloseTo(256);
        expect(0.303 * 512 * t.scale + t.y).toBeCloseTo(256);
    });

    it('centres a source too small to cover the circle instead of pinning one edge', () => {
        // zoom < 1 shrinks the subject below the mask; share the shortfall.
        const t = computeFrameTransform(512, 512, 512, 0.75, 0.1, 0.9, 0.5);
        const extent = 512 * t.scale;
        expect(t.x).toBeCloseTo(256 - extent / 2);
        expect(t.y).toBeCloseTo(256 - extent / 2);
    });
});

describe('parseTokenFrameFlag', () => {
    it('returns null for absent or disabled flags', () => {
        expect(parseTokenFrameFlag(undefined)).toBeNull();
        expect(parseTokenFrameFlag(null)).toBeNull();
        expect(parseTokenFrameFlag(false)).toBeNull();
    });

    it('fills head-biased defaults for a bare enable', () => {
        expect(parseTokenFrameFlag(true)).toEqual({ cx: 0.5, cy: 0.3, content: 0, zoom: 1 });
        expect(parseTokenFrameFlag({})).toEqual({ cx: 0.5, cy: 0.3, content: 0, zoom: 1 });
    });

    it('keeps explicit coordinates and clamps out-of-range values', () => {
        expect(parseTokenFrameFlag({ cx: 0.7, cy: 0.2, content: 0.8 })).toEqual({ cx: 0.7, cy: 0.2, content: 0.8, zoom: 1 });
        expect(parseTokenFrameFlag({ cx: 4, cy: -1 })).toEqual({ cx: 1, cy: 0, content: 0, zoom: 1 });
    });

    it('keeps an explicit zoom and clamps it to [0.25, 4]', () => {
        expect(parseTokenFrameFlag({ zoom: 1.8 })?.zoom).toBe(1.8);
        expect(parseTokenFrameFlag({ zoom: 10 })?.zoom).toBe(4);
        expect(parseTokenFrameFlag({ zoom: 0 })?.zoom).toBe(0.25);
        expect(parseTokenFrameFlag({ zoom: Number.NaN })?.zoom).toBe(1);
    });

    it('ignores non-finite garbage', () => {
        expect(parseTokenFrameFlag({ cx: Number.NaN, cy: Number.POSITIVE_INFINITY })).toEqual({
            cx: 0.5,
            cy: 0.3,
            content: 0,
            zoom: 1,
        });
    });
});

describe('computeFrameTransform zoom', () => {
    it('zoom>1 scales the subject up without enlarging the mask radius', () => {
        const base = computeFrameTransform(512, 512, 512, 0.75, 0.5, 0.5, 1);
        const zoomed = computeFrameTransform(512, 512, 512, 0.75, 0.5, 0.5, 2);
        expect(zoomed.scale).toBeCloseTo(base.scale * 2);
        // the content circle (mask) is unchanged — only the subject grows
        expect(zoomed.radius).toBe(base.radius);
    });
});

describe('resolveTokenFrameFlag', () => {
    const src = (ownFlag: object | boolean | undefined, protoFlag: object | boolean | undefined): FrameFlagSource => ({
        document: { getFlag: (_s: string, _k: string) => ownFlag },
        actor: { prototypeToken: { getFlag: (_s: string, _k: string) => protoFlag } },
    });

    it("uses the token's own flag when present", () => {
        expect(resolveTokenFrameFlag(src({ cx: 0.4 }, { cx: 0.9 }))).toEqual({ cx: 0.4 });
    });

    it('honours an explicit false on the token (opt-out) without falling back', () => {
        // A token deliberately set to tokenFrame=false must NOT inherit the actor's frame.
        expect(resolveTokenFrameFlag(src(false, { cx: 0.9 }))).toBe(false);
    });

    it('falls back to the actor prototype flag when the token has none', () => {
        // The bug: a token placed before the actor gained its portrait framing has
        // no own flag (undefined) and must inherit the prototype's frame on refresh.
        expect(resolveTokenFrameFlag(src(undefined, { cx: 0.6, cy: 0.25 }))).toEqual({ cx: 0.6, cy: 0.25 });
        expect(resolveTokenFrameFlag(src(undefined, true))).toBe(true);
    });

    it('returns undefined when neither the token nor the prototype carries a flag', () => {
        expect(resolveTokenFrameFlag(src(undefined, undefined))).toBeUndefined();
        expect(resolveTokenFrameFlag({ document: { getFlag: () => undefined }, actor: null })).toBeUndefined();
        expect(resolveTokenFrameFlag({ document: { getFlag: () => undefined } })).toBeUndefined();
    });
});

describe('resolveBustContent (global no-clip enforcement)', () => {
    it('normalises to a constant final bust regardless of ring subject scale', () => {
        const atScale1 = resolveBustContent(0, true, 1);
        const atScale08 = resolveBustContent(0, true, 0.8);
        expect(atScale1).toBeCloseTo(0.6, 6); // scale 1 → content 0.6
        expect(atScale08).toBeCloseTo(0.75, 6); // scale 0.8 → content 0.75
        // final size (content × subjectScale) is identical → never clips
        expect(atScale1 * 1).toBeCloseTo(atScale08 * 0.8, 6);
    });

    it('honours an explicit authored content, clamped to 1', () => {
        expect(resolveBustContent(0.5, true, 1)).toBe(0.5);
        expect(resolveBustContent(2, true, 1)).toBe(1);
    });

    it('uses the full frame for a ringless bust', () => {
        expect(resolveBustContent(0, false, 1)).toBe(1);
    });

    it('clamps to 1 and guards a zero/negative subject scale', () => {
        expect(resolveBustContent(0, true, 0.5)).toBe(1); // 0.6 / 0.5 = 1.2 → clamp
        expect(resolveBustContent(0, true, 0)).toBeCloseTo(0.6, 6); // scale 0 → treated as 1
    });
});
