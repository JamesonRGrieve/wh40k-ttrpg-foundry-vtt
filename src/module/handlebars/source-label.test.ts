/**
 * Regression tests for the `sourceLabel` helper logic (#229).
 *
 * The bug: templates interpolated `{{item.system.source}}` directly, but for
 * every `DescriptionTemplate` item `source` is a structured object, so the
 * footer/badge rendered the literal `[object Object]` (and `{{#if}}` on the
 * truthy object showed it even when empty). `formatSourceLabel` collapses both
 * the object and the plain-string shapes to a display string.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { formatSourceLabel } from './source-label.ts';

describe('formatSourceLabel', () => {
    it('formats a book + page reference', () => {
        expect(formatSourceLabel({ book: 'Core Rulebook', page: '229' })).toBe('Core Rulebook, p.229');
    });

    it('coerces a numeric page', () => {
        expect(formatSourceLabel({ book: 'Enemies Within', page: 42 })).toBe('Enemies Within, p.42');
    });

    it('falls back to the book alone, then a url', () => {
        expect(formatSourceLabel({ book: 'Core Rulebook' })).toBe('Core Rulebook');
        expect(formatSourceLabel({ url: 'https://example.test/ref' })).toBe('https://example.test/ref');
    });

    it('returns "" for the empty DescriptionTemplate default (so {{#if}} hides it)', () => {
        // #emptySource() yields book/page/url all '' (plus provenance/derivedFrom/errata, which the label ignores).
        expect(formatSourceLabel({ book: '', page: '', url: '' })).toBe('');
        expect(formatSourceLabel({})).toBe('');
    });

    it('passes a plain-string source through (trimmed)', () => {
        expect(formatSourceLabel('Core p.123')).toBe('Core p.123');
        expect(formatSourceLabel('  spaced  ')).toBe('spaced');
        expect(formatSourceLabel('')).toBe('');
    });

    it('returns "" for null/undefined', () => {
        expect(formatSourceLabel(null)).toBe('');
        expect(formatSourceLabel(undefined)).toBe('');
    });

    it('NEVER returns the literal "[object Object]" for an object source (the bug)', () => {
        const inputs = [{ book: 'X', page: '1' }, { book: 'Y' }, { url: 'z' }, {}, { book: '', page: '' }];
        for (const input of inputs) {
            expect(formatSourceLabel(input)).not.toContain('[object Object]');
        }
    });
});

describe('templates render source via the helper, not the raw object (#229 regression)', () => {
    it('item-card-chat footer uses sourceLabel', () => {
        const src = readRepoFile('src/templates/chat/item-card-chat.hbs');
        expect(src).toContain('sourceLabel item.system.source');
        expect(src).not.toMatch(/\{\{\s*item\.system\.source\s*\}\}/);
    });

    it('item-psychic-power-sheet uses sourceLabel for the source badge', () => {
        const src = readRepoFile('src/templates/item/item-psychic-power-sheet.hbs');
        // The display badge uses the helper; the raw {{item.system.source}} interpolation is gone.
        expect(src).toContain('sourceLabel item.system.source');
    });

    it('the sourceLabel helper is registered', () => {
        const src = readRepoFile('src/module/handlebars/handlebars-helpers.ts');
        expect(src).toContain("registerHelper('sourceLabel'");
    });
});
