import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALL_SYSTEM_IDS } from './config/game-systems/types.ts';
import { WH40K } from './config.ts';
import { buildQualityLabel, parseQualityLevel, withoutRatingPlaceholder } from './utils/quality-id.ts';

/**
 * Guard for the #300 quality-level primitives extracted from the three sites
 * (specialQualities / qualityLookup Handlebars helpers + getQualityLabel) that
 * each re-derived this parse + label-suffix logic.
 */
describe('parseQualityLevel (#300)', () => {
    it('extracts a numeric level', () => {
        expect(parseQualityLevel('blast-3')).toEqual({ baseId: 'blast', level: 3, formula: null });
    });

    it('treats a -x suffix as a level-less placeholder (case-insensitive)', () => {
        expect(parseQualityLevel('flamer-x')).toEqual({ baseId: 'flamer', level: null, formula: null });
        expect(parseQualityLevel('FLAMER-X')).toEqual({ baseId: 'FLAMER', level: null, formula: null });
    });

    it('returns the bare identifier when there is no suffix', () => {
        expect(parseQualityLevel('tearing')).toEqual({ baseId: 'tearing', level: null, formula: null });
        expect(parseQualityLevel('razor-sharp')).toEqual({ baseId: 'razor-sharp', level: null, formula: null });
    });

    it('only strips the final -<n> segment, keeping hyphenated base ids', () => {
        expect(parseQualityLevel('proven-2')).toEqual({ baseId: 'proven', level: 2, formula: null });
        expect(parseQualityLevel('multi-part-5')).toEqual({ baseId: 'multi-part', level: 5, formula: null });
    });

    it('parses a dice-expression rating as a formula, not a level', () => {
        expect(parseQualityLevel('blast-10+1d10')).toEqual({ baseId: 'blast', level: null, formula: '10+1d10' });
        expect(parseQualityLevel('blast-1d10+10')).toEqual({ baseId: 'blast', level: null, formula: '1d10+10' });
        expect(parseQualityLevel('multi-part-2d10')).toEqual({ baseId: 'multi-part', level: null, formula: '2d10' });
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

    it('appends a dice rating as printed', () => {
        expect(buildQualityLabel('Blast', true, null, '10+1d10')).toBe('Blast (10+1d10)');
    });

    // The langpack names rated qualities with the book's placeholder ("Blast (X)"); the
    // area-attack card read "Blast (X) (3)" and the weapon sheet "Snare (X) (1)".
    it('replaces the langpack placeholder with the rating instead of appending after it', () => {
        expect(buildQualityLabel('Blast (X)', true, 3)).toBe('Blast (3)');
        expect(buildQualityLabel('Snare (X)', true, 1)).toBe('Snare (1)');
        expect(buildQualityLabel('Blast (X)', true, null, '10+1d10')).toBe('Blast (10+1d10)');
        expect(buildQualityLabel('Blast (X)', true, null)).toBe('Blast (X)');
    });
});

describe('withoutRatingPlaceholder', () => {
    // The weapon card appends `(level)` to WeaponData.qualitiesArray's label itself, and
    // read "Snare (X) (1)" while the label kept the book's placeholder.
    it('drops only a trailing (X)', () => {
        expect(withoutRatingPlaceholder('Snare (X)')).toBe('Snare');
        expect(withoutRatingPlaceholder('Tearing')).toBe('Tearing');
        expect(withoutRatingPlaceholder('Proven (X) Rounds')).toBe('Proven (X) Rounds');
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

/**
 * `WH40K.calculateDegrees` is a labelled display count with no actor, so it prints
 * the degrees the active method gives (#335): under a forced Gen 1 there is no base
 * degree (DH1 core p. 184), under Gen 2 (the unscoped default) there is.
 */
describe('WH40K.calculateDegrees prints the method’s own count (#335)', () => {
    function stubMode(mode: string): void {
        vi.stubGlobal('game', {
            settings: { get: (): string => mode },
            i18n: { format: (key: string, data: Record<string, string>): string => `${key}:${data['degrees'] ?? ''}` },
        });
    }
    afterEach(() => vi.unstubAllGlobals());

    it('Gen 2 (unscoped default): 01 vs 75 is 8 degrees', () => {
        stubMode('raw');
        expect(WH40K.calculateDegrees(1, 75)).toMatchObject({ success: true, degrees: 8, label: 'WH40K.Degrees.Success:8' });
    });

    it('a forced Gen 1: 01 vs 75 is 7 degrees, and a narrow failure 0', () => {
        stubMode('gen1');
        expect(WH40K.calculateDegrees(1, 75)).toMatchObject({ success: true, degrees: 7, label: 'WH40K.Degrees.Success:7' });
        expect(WH40K.calculateDegrees(80, 75).label).toBe('WH40K.Degrees.Failure:0');
    });
});
