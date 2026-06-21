import { describe, expect, it } from 'vitest';
import { calculatePartyThreat, DIFFICULTY_BANDS, difficultyForRatio } from './threat-utils.ts';

describe('threat-utils', () => {
    describe('calculatePartyThreat', () => {
        it('applies the count × averageLevel × 2 baseline formula', () => {
            expect(calculatePartyThreat(4, 5)).toBe(40);
            expect(calculatePartyThreat(1, 1)).toBe(2);
            expect(calculatePartyThreat(3, 7)).toBe(42);
        });

        it('returns 0 when the party is empty', () => {
            expect(calculatePartyThreat(0, 5)).toBe(0);
        });
    });

    describe('difficultyForRatio', () => {
        it('selects the first band whose maxRatio the ratio does not exceed', () => {
            expect(difficultyForRatio(0).key).toBe('trivial');
            expect(difficultyForRatio(0.5).key).toBe('trivial'); // inclusive upper bound
            expect(difficultyForRatio(0.6).key).toBe('easy');
            expect(difficultyForRatio(0.8).key).toBe('easy');
            expect(difficultyForRatio(1.0).key).toBe('moderate');
            expect(difficultyForRatio(1.2).key).toBe('moderate');
            expect(difficultyForRatio(1.5).key).toBe('dangerous');
            expect(difficultyForRatio(2.0).key).toBe('deadly');
            expect(difficultyForRatio(2.1).key).toBe('apocalyptic');
            expect(difficultyForRatio(99).key).toBe('apocalyptic');
        });

        it('carries the band label key and colour through', () => {
            const band = difficultyForRatio(1.0);
            expect(band.label).toBe('WH40K.Threat.Moderate');
            expect(band.color).toBe(DIFFICULTY_BANDS['moderate']?.color);
            expect(band.maxRatio).toBe(1.2);
        });

        it('resolves the top band for an infinite ratio', () => {
            const band = difficultyForRatio(Infinity);
            expect(band.key).toBe('apocalyptic');
            expect(band.label).toBe('WH40K.Threat.Apocalyptic');
        });
    });
});
