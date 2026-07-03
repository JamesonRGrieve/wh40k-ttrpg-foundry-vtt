import { describe, expect, it } from 'vitest';
import { coverLevelFromBlockedFraction, coverSituationalKey, hasLineOfSight, resolveTargetVisibility } from './cover-detection.ts';

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
});
