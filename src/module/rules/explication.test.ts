import { describe, expect, it } from 'vitest';

import {
    BREAKTHROUGH_FRACTIONS,
    EXPLICATION_THRESHOLDS,
    breakthroughsCrossed,
    isExplicationComplete,
    type ExplicationState,
} from './explication.ts';

describe('explication research engine (#98)', () => {
    it('exposes the four complexity thresholds', () => {
        expect(EXPLICATION_THRESHOLDS).toEqual({ minor: 10, standard: 25, major: 50, grand: 100 });
        expect(BREAKTHROUGH_FRACTIONS).toEqual([0.25, 0.5, 0.75]);
    });

    describe('breakthroughsCrossed', () => {
        it('returns 0 when DoS does not advance', () => {
            expect(breakthroughsCrossed({ complexity: 'standard', oldDoS: 10, newDoS: 10 })).toBe(0);
            expect(breakthroughsCrossed({ complexity: 'standard', oldDoS: 20, newDoS: 5 })).toBe(0);
        });

        it('counts a single fractional milestone crossed', () => {
            // standard total = 25; 25% = 6.25, 50% = 12.5
            expect(breakthroughsCrossed({ complexity: 'standard', oldDoS: 0, newDoS: 7 })).toBe(1);
        });

        it('counts multiple milestones crossed in one movement', () => {
            // 0 → 20 of 25 crosses 25% (6.25), 50% (12.5), 75% (18.75)
            expect(breakthroughsCrossed({ complexity: 'standard', oldDoS: 0, newDoS: 20 })).toBe(3);
        });

        it('does not re-count a milestone already passed', () => {
            // 8 → 13 of 25: 8 already past 25%, only 50% (12.5) newly crossed
            expect(breakthroughsCrossed({ complexity: 'standard', oldDoS: 8, newDoS: 13 })).toBe(1);
        });
    });

    describe('isExplicationComplete', () => {
        const base: Omit<ExplicationState, 'accumulatedDoS' | 'complexity'> = {
            target: 'Hrud',
            objective: 'comprehension',
        };

        it('is false below threshold', () => {
            expect(isExplicationComplete({ ...base, complexity: 'minor', accumulatedDoS: 9 })).toBe(false);
        });

        it('is true at or above threshold', () => {
            expect(isExplicationComplete({ ...base, complexity: 'minor', accumulatedDoS: 10 })).toBe(true);
            expect(isExplicationComplete({ ...base, complexity: 'grand', accumulatedDoS: 150 })).toBe(true);
        });
    });
});
