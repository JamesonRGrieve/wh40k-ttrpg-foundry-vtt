import { describe, expect, it } from 'vitest';
import {
    type CoverEdge,
    coverLevelFromBlockedFraction,
    coverSituationalKey,
    hasLineOfSight,
    rayPassesCover,
    resolveTargetVisibility,
    segmentCrossing,
} from './cover-detection.ts';

/**
 * Pure LoS + full/half cover detection (#406). The blocked/total ray counts come
 * from Foundry canvas ray-casting at the dialog boundary (unit-untestable); this
 * pins the classification thresholds and the situational-key mapping.
 */
describe('coverLevelFromBlockedFraction (#406)', () => {
    it('none below 25%, half in [25%, 75%), full at/above 75%', () => {
        expect(coverLevelFromBlockedFraction(0)).toBe('none');
        expect(coverLevelFromBlockedFraction(0.2)).toBe('none');
        expect(coverLevelFromBlockedFraction(0.25)).toBe('half');
        expect(coverLevelFromBlockedFraction(0.5)).toBe('half');
        expect(coverLevelFromBlockedFraction(0.74)).toBe('half');
        expect(coverLevelFromBlockedFraction(0.75)).toBe('full');
        expect(coverLevelFromBlockedFraction(1)).toBe('full');
    });
});

describe('coverSituationalKey (#406)', () => {
    it('half → coverMedium (+6 AP), full → coverHeavy, none → null', () => {
        expect(coverSituationalKey('half')).toBe('coverMedium');
        expect(coverSituationalKey('full')).toBe('coverHeavy');
        expect(coverSituationalKey('none')).toBeNull();
    });
});

describe('hasLineOfSight (#406)', () => {
    it('is true while at least one ray is unobstructed', () => {
        expect(hasLineOfSight(0, 8)).toBe(true);
        expect(hasLineOfSight(7, 8)).toBe(true);
    });

    it('is false when every ray is blocked, or there are no rays', () => {
        expect(hasLineOfSight(8, 8)).toBe(false);
        expect(hasLineOfSight(0, 0)).toBe(false);
    });
});

describe('resolveTargetVisibility (#406)', () => {
    it('clear line of sight, no cover, no key when nothing is blocked', () => {
        expect(resolveTargetVisibility(0, 8)).toEqual({ hasLineOfSight: true, cover: 'none', coverKey: null });
    });

    it('half cover with LoS when a quarter to most rays are blocked', () => {
        expect(resolveTargetVisibility(4, 8)).toEqual({ hasLineOfSight: true, cover: 'half', coverKey: 'coverMedium' });
    });

    it('full cover but still line of sight when most (not all) rays are blocked', () => {
        expect(resolveTargetVisibility(7, 8)).toEqual({ hasLineOfSight: true, cover: 'full', coverKey: 'coverHeavy' });
    });

    it('no line of sight (and full cover) when every ray is blocked', () => {
        expect(resolveTargetVisibility(8, 8)).toEqual({ hasLineOfSight: false, cover: 'full', coverKey: 'coverHeavy' });
    });

    it('counts rays passing low cover toward cover but never against line of sight', () => {
        // Nothing blocked, but half the rays pass a table before the target: half cover, still in sight.
        expect(resolveTargetVisibility(0, 8, 4)).toEqual({ hasLineOfSight: true, cover: 'half', coverKey: 'coverMedium' });
        // Walls and low cover together: full cover, still in sight while one ray is clear.
        expect(resolveTargetVisibility(3, 8, 4)).toEqual({ hasLineOfSight: true, cover: 'full', coverKey: 'coverHeavy' });
    });
});

describe('segmentCrossing (#406)', () => {
    it('finds where two segments cross, and nothing where they are parallel or apart', () => {
        expect(segmentCrossing({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 0 });
        expect(segmentCrossing({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 10, y: 1 })).toBeNull();
        expect(segmentCrossing({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: -5 }, { x: 5, y: 5 })).toBeNull();
    });
});

describe('rayPassesCover (#406)', () => {
    // A table's near edge, across the ray, 10 px before the target at x 100.
    const table: CoverEdge = { a: { x: 90, y: -20 }, b: { x: 90, y: 20 }, grade: 0.5 };
    const origin = { x: 0, y: 0 };
    const target = { x: 100, y: 0 };

    it('passes cover crossed near the target, of at least half cover', () => {
        expect(rayPassesCover(origin, target, [table], 50)).toBe(true);
        expect(rayPassesCover(origin, target, [{ ...table, grade: 0.25 }], 50)).toBe(false);
    });

    it('ignores cover by the attacker’s own feet, far from the target, and cover the ray misses', () => {
        const attackersOwn: CoverEdge = { a: { x: 10, y: -20 }, b: { x: 10, y: 20 }, grade: 0.5 };
        expect(rayPassesCover(origin, target, [attackersOwn], 50)).toBe(false);
        expect(rayPassesCover(origin, { x: 100, y: 60 }, [table], 50)).toBe(false);
    });
});
