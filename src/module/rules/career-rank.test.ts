import { describe, expect, it } from 'vitest';
import { isStoredRank, rankForExperience } from './career-rank.ts';

/** A DH1 Guardsman's printed starting XP per rank, its rank-6 paths sharing one. */
const GUARDSMAN = [
    { rank: 1, minXp: 0 },
    { rank: 2, minXp: 500 },
    { rank: 3, minXp: 1000 },
    { rank: 6, minXp: 6000 },
    { rank: 6, minXp: 6000 },
    { rank: 6, minXp: 6000 },
];

describe('rankForExperience', () => {
    it('is the highest rank whose starting XP the total has reached', () => {
        expect(rankForExperience(GUARDSMAN, 0)).toBe(1);
        expect(rankForExperience(GUARDSMAN, 499)).toBe(1);
        expect(rankForExperience(GUARDSMAN, 500)).toBe(2);
        expect(rankForExperience(GUARDSMAN, 5999)).toBe(3);
        expect(rankForExperience(GUARDSMAN, 6000)).toBe(6);
    });

    it('is null when the table prints no starting XP, so a stored rank stands', () => {
        expect(rankForExperience([{ rank: 1, minXp: null }, { rank: 2 }], 5000)).toBeNull();
        expect(rankForExperience([], 5000)).toBeNull();
    });
});

describe('isStoredRank', () => {
    it('accepts a whole number of at least 1 only', () => {
        expect(isStoredRank(3)).toBe(true);
        expect([null, 0, 2.5, '2'].map(isStoredRank)).toEqual([false, false, false, false]);
    });
});
