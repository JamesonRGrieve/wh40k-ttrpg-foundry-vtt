import { describe, expect, it } from 'vitest';
import { THREAT_BANDS, tierBandFor } from './threat-bands.ts';

/**
 * Guards the single-sourced threat-band table (#310). The four legacy sites
 * (npc.ts threatDescription/threatTier, threat-calculator getTierInfo,
 * quick-create-dialog _getTierDescription) all used the inclusive-upper
 * `level <= 5 / <= 10 / <= 15 / <= 20` cascade; these tests pin that the
 * shared lookup reproduces it exactly at every boundary.
 */
describe('threat-bands', () => {
    it('exposes the five FFG bands in ascending order with contiguous bounds', () => {
        expect(THREAT_BANDS.map((b) => b.key)).toEqual(['minor', 'standard', 'tough', 'elite', 'boss']);
        expect(THREAT_BANDS.map((b) => b.minThreat)).toEqual([1, 6, 11, 16, 21]);
        expect(THREAT_BANDS.map((b) => b.maxThreat)).toEqual([5, 10, 15, 20, Number.POSITIVE_INFINITY]);
    });

    it('preserves the canonical colours shared by npc.ts and threat-calculator', () => {
        // Colours pinned in band order (the key order is asserted in the test above).
        expect(THREAT_BANDS.map((b) => b.color)).toEqual(['#4caf50', '#2196f3', '#ff9800', '#f44336', '#9c27b0']);
    });

    it('carries the Latin badge labels and prose description keys', () => {
        const minor = tierBandFor(3);
        expect(minor.label).toBe('Minor');
        expect(minor.latinLabel).toBe('Hereticus Minoris');
        expect(minor.descriptionKey).toBe('WH40K.Threat.Low');
        expect(tierBandFor(30).latinLabel).toBe('Hereticus Maximus');
        expect(tierBandFor(30).descriptionKey).toBe('WH40K.Threat.Apocalyptic');
    });

    it.each([
        [1, 'minor'],
        [5, 'minor'],
        [6, 'standard'],
        [10, 'standard'],
        [11, 'tough'],
        [15, 'tough'],
        [16, 'elite'],
        [20, 'elite'],
        [21, 'boss'],
        [30, 'boss'],
        [9999, 'boss'],
    ] as const)('maps boundary level %i to band %s', (level, key) => {
        expect(tierBandFor(level).key).toBe(key);
    });

    it('clamps sub-minimum levels (0 / negative) to the minor band', () => {
        expect(tierBandFor(0).key).toBe('minor');
        expect(tierBandFor(-7).key).toBe('minor');
    });
});
