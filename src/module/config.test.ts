import { describe, expect, it } from 'vitest';
import { ALL_SYSTEM_IDS } from './config/game-systems/types.ts';
import { WH40K, buildQualityLabel, parseQualityLevel } from './config.ts';

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

/**
 * Parameterized integrity guard for the per-line acquisition-currency registry
 * (the "homebrew thrones / currency" system parameter). Confirms every currency
 * entry is wired to a valid game line with a line-scoped cost path and a wallet
 * path, that the six FFG lines are each covered, that exactly one is the
 * throne-gelt baseline, and documents that Imperium Maledictum has no native
 * acquisition currency yet (solars post-date the six-line cost shape).
 */
describe('WH40K.currencies — per-line acquisition currency registry', () => {
    const entries = Object.entries(WH40K.currencies);

    it('covers each of the six FFG acquisition lines exactly once', () => {
        const lines = entries.map(([, currency]) => currency.line).sort();
        expect(lines).toEqual(['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt']);
    });

    it.each(entries)('%s is wired to a valid line, a line-scoped costPath, and a wallet path', (_key, currency) => {
        expect(currency.label).toBeTruthy();
        expect(currency.abbreviation).toBeTruthy();
        expect(ALL_SYSTEM_IDS).toContain(currency.line);
        // The cost path addresses this currency's own line's cost block.
        expect(currency.costPath.startsWith(`system.cost.${currency.line}.`)).toBe(true);
        expect(currency.walletPath.startsWith('system.')).toBe(true);
    });

    it('marks exactly one currency as the throne-gelt primary baseline', () => {
        const primaries = entries.filter(([, currency]) => currency.primary === true).map(([key]) => key);
        expect(primaries).toEqual(['throne']);
    });

    it('has no native acquisition currency for Imperium Maledictum (solars post-date the six-line shape)', () => {
        expect(entries.some(([, currency]) => currency.line === 'im')).toBe(false);
    });
});
