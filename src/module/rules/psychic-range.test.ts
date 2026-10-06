import { describe, expect, it } from 'vitest';
import { parsePsychicRange, type PsychicFormulaValues, resolvePsychicFormulaTerms } from './psychic-range.ts';

describe('resolvePsychicFormulaTerms — the caster terms in a power’s damage / penetration', () => {
    const at = (psyRating: number, willpowerBonus = 4, toughnessBonus = 5): PsychicFormulaValues => ({ psyRating, willpowerBonus, toughnessBonus });

    it('substitutes the Psy Rating for every PR term', () => {
        expect(resolvePsychicFormulaTerms('1d10+PR', at(3))).toBe('1d10+3');
        expect(resolvePsychicFormulaTerms('PR*2', at(4))).toBe('4*2');
        expect(resolvePsychicFormulaTerms('PR', at(3))).toBe('3');
    });

    it('turns a written multiple of PR into a product', () => {
        expect(resolvePsychicFormulaTerms('1d10+2xPR', at(3))).toBe('1d10+2*3');
        expect(resolvePsychicFormulaTerms('2d10+3 x PR', at(4))).toBe('2d10+3*4');
        expect(resolvePsychicFormulaTerms('1d10+2×PR', at(2))).toBe('1d10+2*2');
    });

    it('reads PR as a die count (Bolt of Change "PRd10")', () => {
        expect(resolvePsychicFormulaTerms('PRd10', at(3))).toBe('3d10');
        expect(resolvePsychicFormulaTerms('PRd10+2', at(4))).toBe('4d10+2');
    });

    it("substitutes the caster's Willpower Bonus (WPB / WB) and Toughness Bonus (TB)", () => {
        expect(resolvePsychicFormulaTerms('1d10+WPB', at(3))).toBe('1d10+4');
        expect(resolvePsychicFormulaTerms('1d10+WB', at(3))).toBe('1d10+4');
        expect(resolvePsychicFormulaTerms('1d10+TB', at(3))).toBe('1d10+5');
    });

    it('leaves formulas without a term, and words merely containing one, unchanged', () => {
        expect(resolvePsychicFormulaTerms('2d10+4', at(3))).toBe('2d10+4');
        expect(resolvePsychicFormulaTerms('1d10+PRX', at(3))).toBe('1d10+PRX');
    });

    it('clamps a non-finite or negative value to 0', () => {
        expect(resolvePsychicFormulaTerms('1d10+PR', at(Number.NaN))).toBe('1d10+0');
        expect(resolvePsychicFormulaTerms('1d10+PR', at(-2))).toBe('1d10+0');
    });
});

describe('parsePsychicRange — the printed range grammar the books use (D206)', () => {
    const PR = 3;
    const WB = 4;
    it.each([
        ['5 metres x Psy Rating radius', 15],
        ['5m x Psy Rating Radius', 15],
        ['5 metres per Psy Rating', 15],
        ['5 metres x PR', 15],
        ['10 x PR', 30],
        ['1km x Psy Rating', 3000],
        ['1 kilometre x psy rating', 3000],
        ['1,000 kilometres × psy rating', 3_000_000],
        ['5m × Willpower Bonus', 20],
        ['1km/Willpower Bonus', 4000],
        ['Psy Rating metres', 3],
        ['20 metre radius', 20],
        ['Self or 10 metres x PR', 30],
        ['10m x Psy Rating (max. 50m)', 30],
        ['30m x Psy Rating (max. 50m)', 50],
    ])('reads "%s" as %i metres', (raw, metres) => {
        expect(parsePsychicRange(raw, PR, WB)).toBe(metres);
    });

    it.each(['Earshot', 'Line of Sight', 'Unlimited', 'Special'])('treats "%s" as no bounded distance', (raw) => {
        expect(parsePsychicRange(raw, PR, WB)).toBe(0);
    });

    it.each(['2d10 metres x PR', '5 VU x Psy Rating'])('leaves "%s" unresolved (variable or starship scale)', (raw) => {
        expect(parsePsychicRange(raw, PR, WB)).toBeNull();
    });
});

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
