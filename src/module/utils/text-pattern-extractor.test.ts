import { describe, expect, it } from 'vitest';
import TextPatternExtractor from './text-pattern-extractor.ts';

/**
 * Coverage for the pure text-parsing helpers in TextPatternExtractor
 * (previously untested). These back the stat-block / compendium import parsers.
 */
const T = TextPatternExtractor;

describe('splitList', () => {
    it('splits on top-level commas and semicolons', () => {
        expect(T.splitList('a, b; c')).toEqual(['a', 'b', 'c']);
    });

    it('does not split inside parentheses', () => {
        expect(T.splitList('Blast (1, 2), Tearing')).toEqual(['Blast (1, 2)', 'Tearing']);
    });

    it('drops empty entries and returns [] for empty input', () => {
        expect(T.splitList('a,,b')).toEqual(['a', 'b']);
        expect(T.splitList('')).toEqual([]);
    });
});

describe('cleanEntry', () => {
    it('strips trailing dots and collapses whitespace', () => {
        expect(T.cleanEntry('Foo...')).toBe('Foo');
        expect(T.cleanEntry('a   b')).toBe('a b');
        expect(T.cleanEntry('  x  ')).toBe('x');
    });
});

describe('parseNumericValue', () => {
    it('parses integers and treats dashes/empties/non-numeric as 0', () => {
        expect(T.parseNumericValue('5')).toBe(5);
        expect(T.parseNumericValue('12kg')).toBe(12);
        expect(T.parseNumericValue('-')).toBe(0);
        expect(T.parseNumericValue('--')).toBe(0);
        expect(T.parseNumericValue('abc')).toBe(0);
        expect(T.parseNumericValue('')).toBe(0);
    });
});

describe('extractParentheticalNumbers', () => {
    it('pulls every (n) value in order', () => {
        expect(T.extractParentheticalNumbers('Blast (3) Tearing (1)')).toEqual([3, 1]);
        expect(T.extractParentheticalNumbers('no parens')).toEqual([]);
    });
});

describe('removeParentheses', () => {
    it('removes parenthetical groups and trims', () => {
        expect(T.removeParentheses('Foo (bar)')).toBe('Foo');
    });
});

describe('normalizeInput', () => {
    it('converts en/em dashes to hyphens, tabs to spaces, and drops carriage returns', () => {
        expect(T.normalizeInput('a–b')).toBe('a-b');
        expect(T.normalizeInput('a—b')).toBe('a-b');
        expect(T.normalizeInput('a\tb')).toBe('a b');
        expect(T.normalizeInput('a\r\nb')).toBe('a\nb');
    });
});

describe('splitLines', () => {
    it('trims and drops blank lines', () => {
        expect(T.splitLines('a\n\n  b  \nc')).toEqual(['a', 'b', 'c']);
    });
});

describe('toKey', () => {
    it('camelCases multi-word text and slugs punctuation', () => {
        expect(T.toKey('Common Lore')).toBe('commonLore');
        expect(T.toKey('Chem-Use')).toBe('chemUse');
    });

    it('optionally capitalises the first letter, and returns "" for non-alphanumeric input', () => {
        expect(T.toKey('Common Lore', true)).toBe('CommonLore');
        expect(T.toKey('---')).toBe('');
    });
});

describe('looksLikeHeader', () => {
    it('is true only when every required token is present', () => {
        expect(T.looksLikeHeader('WS BS S T Ag', ['WS', 'BS'])).toBe(true);
        expect(T.looksLikeHeader('foo bar', ['WS'])).toBe(false);
    });
});

describe('parseValueWithModifier', () => {
    it('splits "<name> +<n>" into value + bonus', () => {
        expect(T.parseValueWithModifier('Awareness +10')).toEqual({ value: 'Awareness', bonus: 10, hasBonus: true });
    });

    it('returns the trimmed entry with no bonus otherwise', () => {
        expect(T.parseValueWithModifier('Dodge')).toEqual({ value: 'Dodge', bonus: 0, hasBonus: false });
    });
});

describe('parseRange', () => {
    it('parses a metre range, melee, and null', () => {
        expect(T.parseRange('10m')).toEqual({ value: 10, unit: 'm', type: 'ranged' });
        expect(T.parseRange('Melee')).toEqual({ value: 0, unit: null, type: 'melee' });
        expect(T.parseRange('unparseable')).toBeNull();
    });
});
