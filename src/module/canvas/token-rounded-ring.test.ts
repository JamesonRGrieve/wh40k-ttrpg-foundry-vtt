import { describe, expect, it } from 'vitest';
import { SYSTEM_ID } from '../constants.ts';
import { computeCoverTransform, isRoundedRingToken, ringModeUpdate, roundedRectMetrics, roundedTextureSize } from './token-rounded-ring.ts';

describe('ringModeUpdate', () => {
    it('puts a new non-square token into rounded mode even when it shipped ringless (vehicles)', () => {
        expect(ringModeUpdate({ width: 3, height: 2, ringEnabled: false, rounded: undefined, creating: true })).toEqual({
            flags: { [SYSTEM_ID]: { roundedRing: true } },
        });
    });

    it('swaps a ringed non-square token off the core ring into rounded mode', () => {
        expect(ringModeUpdate({ width: 3, height: 2, ringEnabled: true, rounded: undefined, creating: false })).toEqual({
            ring: { enabled: false },
            flags: { [SYSTEM_ID]: { roundedRing: true } },
        });
    });

    it('hands a rounded token resized to square back to the core circular ring', () => {
        expect(ringModeUpdate({ width: 2, height: 2, ringEnabled: false, rounded: true, creating: false })).toEqual({
            ring: { enabled: true },
            flags: { [SYSTEM_ID]: { roundedRing: false } },
        });
    });

    it('leaves a square ringed token and an already-rounded token alone', () => {
        expect(ringModeUpdate({ width: 1, height: 1, ringEnabled: true, rounded: undefined, creating: true })).toEqual({});
        expect(ringModeUpdate({ width: 3, height: 2, ringEnabled: false, rounded: true, creating: false })).toEqual({});
    });

    it('does not invent a ring for an existing ringless token that is resized non-square', () => {
        expect(ringModeUpdate({ width: 3, height: 2, ringEnabled: false, rounded: undefined, creating: false })).toEqual({});
    });

    it('respects an explicit opt-out', () => {
        expect(ringModeUpdate({ width: 3, height: 2, ringEnabled: false, rounded: false, creating: true })).toEqual({});
    });
});

describe('roundedRectMetrics', () => {
    it('scales corner radius and band to the short side', () => {
        const m = roundedRectMetrics(300, 200);
        expect(m.radius).toBeCloseTo(36, 6);
        expect(m.band).toBeCloseTo(12, 6);
    });
});

describe('roundedTextureSize', () => {
    it('keeps the token aspect with a 512 px long side', () => {
        expect(roundedTextureSize(300, 200)).toEqual({ width: 512, height: 341 });
        expect(roundedTextureSize(100, 300)).toEqual({ width: 171, height: 512 });
    });

    it('falls back to a square for a degenerate size', () => {
        expect(roundedTextureSize(0, 0)).toEqual({ width: 512, height: 512 });
    });
});

describe('computeCoverTransform', () => {
    it('covers the box with a centred image', () => {
        const t = computeCoverTransform(1000, 500, 300, 200, 0.5, 0.5);
        expect(t.scale).toBeCloseTo(0.4, 6); // height-bound: 200 / 500
        expect(t.x).toBeCloseTo(-50, 6); // 400 px wide image centred in 300
        expect(t.y).toBeCloseTo(0, 6);
    });

    it('clamps an off-centre focus so no edge is left uncovered', () => {
        const t = computeCoverTransform(1000, 500, 300, 200, 0, 0.5);
        expect(t.x).toBe(0); // would slide right past the left edge; clamped
        const r = computeCoverTransform(1000, 500, 300, 200, 1, 0.5);
        expect(r.x).toBeCloseTo(-100, 6); // clamped to the right edge (300 - 400)
    });

    it('zooms beyond cover but never below it', () => {
        expect(computeCoverTransform(1000, 500, 300, 200, 0.5, 0.5, 2).scale).toBeCloseTo(0.8, 6);
        expect(computeCoverTransform(1000, 500, 300, 200, 0.5, 0.5, 0.5).scale).toBeCloseTo(0.4, 6);
    });
});

describe('isRoundedRingToken', () => {
    it('reads the roundedRing flag', () => {
        const token = (flag: boolean | undefined): { document: { getFlag: () => boolean | undefined } } => ({ document: { getFlag: () => flag } });
        expect(isRoundedRingToken(token(true))).toBe(true);
        expect(isRoundedRingToken(token(false))).toBe(false);
        expect(isRoundedRingToken(token(undefined))).toBe(false);
    });
});
