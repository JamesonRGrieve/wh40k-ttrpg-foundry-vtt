import { describe, expect, it } from 'vitest';
import { getMalignancyTestTarget, malignancyThresholdsCrossed } from './malignancy-test';

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
    it('handles negative or non-integer inputs safely', () => {
        expect(malignancyThresholdsCrossed(-3, 5)).toBe(0);
        expect(malignancyThresholdsCrossed(8.7, 13.2)).toBe(1);
    });
});

describe('getMalignancyTestTarget', () => {
    it('returns the raw WP when corruption is below 10', () => {
        expect(getMalignancyTestTarget(40, 5)).toBe(40);
    });
    it('subtracts 10 per 10 CP tier', () => {
        expect(getMalignancyTestTarget(40, 10)).toBe(30);
        expect(getMalignancyTestTarget(40, 25)).toBe(20);
        expect(getMalignancyTestTarget(40, 30)).toBe(10);
    });
    it('clamps at 0', () => {
        expect(getMalignancyTestTarget(20, 50)).toBe(0);
    });
});
