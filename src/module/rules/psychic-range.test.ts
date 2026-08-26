import { describe, expect, it } from 'vitest';
import { parsePsychicRange } from './psychic-range.ts';

describe('parsePsychicRange — scaling ranges (#568)', () => {
    it('resolves Dominate\'s "5 metres x Psy Rating" against the caster PR', () => {
        // The reported regression: Dominate's authored range.
        expect(parsePsychicRange('5 metres x Psy Rating', 3)).toBe(15);
        expect(parsePsychicRange('5 metres x Psy Rating', 1)).toBe(5);
    });

    it('scales other "N metres x Psy Rating" powers', () => {
        expect(parsePsychicRange('10 metres x Psy Rating', 4)).toBe(40);
        expect(parsePsychicRange('20 metres x Psy Rating', 2)).toBe(40);
    });

    it('tolerates case, spacing, the × glyph, and the abbreviated unit', () => {
        expect(parsePsychicRange('  5  METRES  x  PSY RATING ', 3)).toBe(15);
        expect(parsePsychicRange('5 metres × Psy Rating', 3)).toBe(15);
        expect(parsePsychicRange('5m x psy rating', 3)).toBe(15);
    });

    it('yields 0 at Psy Rating 0', () => {
        expect(parsePsychicRange('5 metres x Psy Rating', 0)).toBe(0);
    });
});

describe('parsePsychicRange — plain metres and integers', () => {
    it('parses bare metre strings', () => {
        expect(parsePsychicRange('30m', 3)).toBe(30);
        expect(parsePsychicRange('100 metres', 3)).toBe(100);
        expect(parsePsychicRange('3 m', 3)).toBe(3);
        expect(parsePsychicRange('20M', 3)).toBe(20);
    });

    it('parses a bare integer and a numeric input', () => {
        expect(parsePsychicRange('5', 3)).toBe(5);
        expect(parsePsychicRange(20, 3)).toBe(20);
        expect(parsePsychicRange(20.7, 3)).toBe(20);
        expect(parsePsychicRange(-5, 3)).toBe(0);
    });
});

describe('parsePsychicRange — non-metric ranges resolve to 0 with no warning', () => {
    it('recognises self/touch/band/characteristic tokens and empties', () => {
        for (const token of ['Self', 'You', 'Touch', 'Personal', 'Melee', '—', '-', '', 'Willpower', 'Opposed Willpower', 'Psyniscience', 'Medium', 'Long']) {
            expect(parsePsychicRange(token, 3)).toBe(0);
        }
    });

    it('treats a missing range as 0', () => {
        expect(parsePsychicRange(undefined, 3)).toBe(0);
        expect(parsePsychicRange(null, 3)).toBe(0);
    });
});

describe('parsePsychicRange — unrecognised values return null (caller logs + falls back)', () => {
    it('returns null for genuinely unparseable strings', () => {
        expect(parsePsychicRange('gibberish', 3)).toBeNull();
        expect(parsePsychicRange('5 leagues', 3)).toBeNull();
        expect(parsePsychicRange('within line of sight', 3)).toBeNull();
    });

    it('returns null for a non-finite number', () => {
        expect(parsePsychicRange(Number.NaN, 3)).toBeNull();
        expect(parsePsychicRange(Number.POSITIVE_INFINITY, 3)).toBeNull();
    });
});
