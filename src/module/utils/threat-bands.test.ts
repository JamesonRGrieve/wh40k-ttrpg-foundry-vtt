import { describe, expect, it } from 'vitest';
import { buildLangStub } from '../testing/lang-stub.ts';
import { capitalize } from './format.ts';
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

    it('carries line-neutral badge label keys and prose description keys', () => {
        const minor = tierBandFor(3);
        // The badge once showed Inquisition-only Latin ("Hereticus Minoris") on every line.
        expect(minor.labelKey).toBe('WH40K.Threat.Tier.Minor');
        expect(minor.descriptionKey).toBe('WH40K.Threat.Low');
        expect(tierBandFor(30).labelKey).toBe('WH40K.Threat.Tier.Boss');
        expect(tierBandFor(30).descriptionKey).toBe('WH40K.Threat.Apocalyptic');
        expect(THREAT_BANDS.map((b) => b.labelKey)).toEqual(THREAT_BANDS.map((b) => `WH40K.Threat.Tier.${capitalize(b.key)}`));
    });

    it('carries no English display label — only langpack keys', () => {
        for (const band of THREAT_BANDS) expect(Object.keys(band)).not.toContain('label');
    });

    it('every band resolves its label, description and generator-tier keys through the langpack', () => {
        const lang = buildLangStub();
        const keys = THREAT_BANDS.flatMap((band) => [band.labelKey, band.descriptionKey, `WH40K.NPC.Tier${capitalize(band.key)}`]);
        expect(keys.filter((key) => !lang.has(key))).toEqual([]);
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
