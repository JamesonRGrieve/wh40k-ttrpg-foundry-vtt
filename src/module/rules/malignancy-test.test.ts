import { describe, expect, it } from 'vitest';
import { corruptionTrackModifier, getMalignancyTestTarget, malignancyTestsQueued, malignancyThresholdsCrossed } from './malignancy-test';

describe('malignancyTestsQueued', () => {
    it('adds one test per threshold crossed to those already owed', () => {
        expect(malignancyTestsQueued(0, 8, 12)).toBe(1);
        expect(malignancyTestsQueued(1, 25, 47)).toBe(3);
    });
    it('leaves the queue alone when no threshold is crossed', () => {
        expect(malignancyTestsQueued(2, 12, 18)).toBe(2);
    });
    it('never cancels an owed test when Corruption falls', () => {
        expect(malignancyTestsQueued(2, 40, 10)).toBe(2);
    });
});

describe('malignancyThresholdsCrossed', () => {
    it('returns 0 when corruption did not move', () => {
        expect(malignancyThresholdsCrossed(15, 15)).toBe(0);
    });
    it('returns 0 when corruption rose without crossing a 10-multiple', () => {
        expect(malignancyThresholdsCrossed(12, 18)).toBe(0);
    });
    it('returns 1 when corruption crossed a single 10-multiple', () => {
        expect(malignancyThresholdsCrossed(8, 12)).toBe(1);
        expect(malignancyThresholdsCrossed(19, 20)).toBe(1);
    });
    it('returns the count of multiples crossed on big jumps', () => {
        expect(malignancyThresholdsCrossed(5, 35)).toBe(3);
    });
    it('returns 0 when corruption fell', () => {
        expect(malignancyThresholdsCrossed(35, 5)).toBe(0);
    });
    it('handles negative or non-integer inputs safely', () => {
        expect(malignancyThresholdsCrossed(-3, 5)).toBe(0);
        expect(malignancyThresholdsCrossed(8.7, 13.2)).toBe(1);
    });
});

describe('corruptionTrackModifier (the Corruption Track)', () => {
    it('is +0 while Tainted (up to 30)', () => {
        expect(corruptionTrackModifier(0)).toBe(0);
        expect(corruptionTrackModifier(10)).toBe(0);
        expect(corruptionTrackModifier(30)).toBe(0);
    });
    it('is −10 Soiled, −20 Debased, −30 Profane', () => {
        expect(corruptionTrackModifier(31)).toBe(-10);
        expect(corruptionTrackModifier(60)).toBe(-10);
        expect(corruptionTrackModifier(61)).toBe(-20);
        expect(corruptionTrackModifier(90)).toBe(-20);
        expect(corruptionTrackModifier(91)).toBe(-30);
        expect(corruptionTrackModifier(99)).toBe(-30);
    });
    it('floors at the Profane modifier past the track', () => {
        expect(corruptionTrackModifier(100)).toBe(-30);
    });
});

describe('getMalignancyTestTarget', () => {
    it('is straight Willpower on the Tainted band', () => {
        expect(getMalignancyTestTarget(40, 5)).toBe(40);
        expect(getMalignancyTestTarget(40, 20)).toBe(40);
        expect(getMalignancyTestTarget(40, 30)).toBe(40);
    });
    it('applies the band modifier, not −10 per 10 CP', () => {
        expect(getMalignancyTestTarget(40, 40)).toBe(30);
        expect(getMalignancyTestTarget(40, 70)).toBe(20);
        expect(getMalignancyTestTarget(40, 95)).toBe(10);
    });
    it('clamps at 0', () => {
        expect(getMalignancyTestTarget(20, 95)).toBe(0);
    });
});
