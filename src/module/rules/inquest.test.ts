import { describe, expect, it } from 'vitest';
import { getCurrentRevelationTier, inquestRevelationsCrossed, INQUEST_THRESHOLDS } from './inquest';

describe('INQUEST_THRESHOLDS', () => {
    it('lists the canonical 200/400/600/900/1200', () => {
        expect([...INQUEST_THRESHOLDS]).toEqual([200, 400, 600, 900, 1200]);
    });
});

describe('inquestRevelationsCrossed', () => {
    it('returns 0 when IP did not move', () => {
        expect(inquestRevelationsCrossed(300, 300)).toBe(0);
    });
    it('returns 1 when one threshold was crossed', () => {
        expect(inquestRevelationsCrossed(150, 250)).toBe(1);
    });
    it('returns the count for big jumps', () => {
        expect(inquestRevelationsCrossed(0, 1200)).toBe(5);
        expect(inquestRevelationsCrossed(150, 950)).toBe(4); // 200, 400, 600, 900
    });
    it('handles negative inputs as zero', () => {
        expect(inquestRevelationsCrossed(-5, 250)).toBe(1);
    });
});

describe('getCurrentRevelationTier', () => {
    it('starts at 0', () => {
        expect(getCurrentRevelationTier(0)).toBe(0);
        expect(getCurrentRevelationTier(199)).toBe(0);
    });
    it('escalates at each threshold', () => {
        expect(getCurrentRevelationTier(200)).toBe(1);
        expect(getCurrentRevelationTier(400)).toBe(2);
        expect(getCurrentRevelationTier(900)).toBe(4);
        expect(getCurrentRevelationTier(1200)).toBe(5);
        expect(getCurrentRevelationTier(9999)).toBe(5);
    });
});
