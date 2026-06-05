import { describe, expect, it } from 'vitest';
import { buildQualityLabel, parseQualityLevel } from './config.ts';

/**
 * Guard for the #300 quality-level primitives extracted from the three sites
 * (specialQualities / qualityLookup Handlebars helpers + getQualityLabel) that
 * each re-derived this parse + label-suffix logic.
 */
describe('parseQualityLevel (#300)', () => {
    it('extracts a numeric level', () => {
        expect(parseQualityLevel('blast-3')).toEqual({ baseId: 'blast', level: 3 });
    });

    it('treats a -x suffix as a level-less placeholder (case-insensitive)', () => {
        expect(parseQualityLevel('flamer-x')).toEqual({ baseId: 'flamer', level: null });
        expect(parseQualityLevel('FLAMER-X')).toEqual({ baseId: 'FLAMER', level: null });
    });

    it('returns the bare identifier when there is no suffix', () => {
        expect(parseQualityLevel('tearing')).toEqual({ baseId: 'tearing', level: null });
    });

    it('only strips the final -<n> segment, keeping hyphenated base ids', () => {
        expect(parseQualityLevel('proven-2')).toEqual({ baseId: 'proven', level: 2 });
        expect(parseQualityLevel('multi-part-5')).toEqual({ baseId: 'multi-part', level: 5 });
    });
});

describe('buildQualityLabel (#300)', () => {
    it('returns the base unchanged when the quality has no level', () => {
        expect(buildQualityLabel('Tearing', false, null)).toBe('Tearing');
        expect(buildQualityLabel('Tearing', false, 3)).toBe('Tearing');
    });

    it('appends the level for a level-bearing quality', () => {
        expect(buildQualityLabel('Blast', true, 6)).toBe('Blast (6)');
    });

    it('appends (X) when the quality takes a level but none was supplied', () => {
        expect(buildQualityLabel('Blast', true, null)).toBe('Blast (X)');
    });
});
