/**
 * Unit tests for the copyright gate (`scripts/copyright-audit.mjs`): the public
 * tree carries no page citations, book titles or book-named pack ids.
 *
 * This file must spell violations to test them, so the gate skips it. The book
 * titles and pack ids below are invented; the real ones come from the private
 * content at run time.
 */
import { describe, expect, it } from 'vitest';
import { GENERIC_RULES, contentRules, findViolations, isScanned } from '../scripts/copyright-audit.mjs';

function rulesHit(text: string, repoDocs?: ReadonlySet<string>): string[] {
    return findViolations(text, GENERIC_RULES, repoDocs).map((hit) => hit.rule);
}

describe('copyright gate — generic rules', () => {
    it('flags page citations in their common spellings', () => {
        expect(rulesHit('see p. 12')).toEqual(['page-citation']);
        expect(rulesHit('(pp.120-124)')).toEqual(['page-citation']);
        expect(rulesHit('Per the rules pg 80')).toEqual(['page-citation']);
        expect(rulesHit('on page 230')).toEqual(['page-citation']);
    });

    it('passes a "Book, p.N" source-label format sample', () => {
        expect(rulesHit("expect(label).toBe('Sample Book, p.12')")).toEqual([]);
        expect(rulesHit("'DH2: Sample Sourcebook, p.61'")).toEqual([]);
    });

    it('passes long id-like digit runs that only look like a page', () => {
        expect(rulesHit("{ _id: 'pg00000000000001' }")).toEqual([]);
    });

    it('flags "<line> core" shorthand for a line\'s core book', () => {
        expect(rulesHit('the cap is ±60 (DH2 core)')).toEqual(['line-core-shorthand']);
        expect(rulesHit('Rogue Trader Core rules')).toEqual(['line-core-shorthand']);
        expect(rulesHit('a plain core rules mention')).toEqual([]);
    });

    it('flags references into the transcribed books, but not repo docs', () => {
        expect(rulesHit('core.md L10646')).toEqual(['book-corpus-ref']);
        expect(rulesHit('within.md §Inquest')).toEqual(['book-corpus-ref']);
        expect(rulesHit('see CLAUDE.md § Hard rules', new Set(['CLAUDE.md']))).toEqual([]);
    });

    it('flags printed table and chapter numbers', () => {
        expect(rulesHit('draws Table 8-12')).toEqual(['printed-table']);
        expect(rulesHit('Tables 7–7 to 7–22')).toEqual(['printed-table']);
        expect(rulesHit('Chapter VII')).toEqual(['printed-table']);
        expect(rulesHit('the critical hit table')).toEqual([]);
    });

    it('reports the line of each hit', () => {
        expect(findViolations('clean\nsee p. 4\nclean', GENERIC_RULES)).toEqual([{ line: 2, rule: 'page-citation', match: 'p. 4' }]);
    });
});

describe('copyright gate — content rules', () => {
    const rules = contentRules({ titles: ['Tome of Samples', 'Lexicon'], packIds: ['xx-tome-items-gear', 'xx-tome-items-gear-extra'] });

    it('flags a multi-word book title, case-sensitively', () => {
        expect(findViolations('as Tome of Samples prints', rules).map((hit) => hit.rule)).toEqual(['book-title']);
        expect(findViolations('a tome of samples in prose', rules)).toEqual([]);
    });

    it('ignores single-word titles, which collide with ordinary words', () => {
        expect(findViolations('Lexicon', rules)).toEqual([]);
    });

    it('flags a book-named pack id as a whole id', () => {
        expect(findViolations("pack('xx-tome-items-gear')", rules).map((hit) => hit.match)).toEqual(['xx-tome-items-gear']);
        expect(findViolations("pack('xx-tome-items-gear-extra')", rules).map((hit) => hit.match)).toEqual(['xx-tome-items-gear-extra']);
        expect(findViolations("pack('xx-tome-items-gearbox')", rules)).toEqual([]);
    });

    it('builds no rules from empty content', () => {
        expect(contentRules({})).toEqual([]);
    });
});

describe('copyright gate — scan scope', () => {
    it.each(['icons/a.png', 'logs/x.log.gz', 'pnpm-lock.yaml', 'LICENSE', 'src/module/types/i18n-keys.d.ts', 'tests/copyright-audit.test.ts'])(
        'skips %s',
        (path) => {
            expect(isScanned(path)).toBe(false);
        },
    );

    it.each(['src/module/rules/grapple.ts', 'src/templates/chat/x.hbs', 'docs/pack-authoring.md', 'src/lang/en.json'])('scans %s', (path) => {
        expect(isScanned(path)).toBe(true);
    });
});
