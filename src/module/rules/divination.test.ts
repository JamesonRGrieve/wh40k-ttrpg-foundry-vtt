import { describe, expect, it } from 'vitest';
import { divinationMaxim, plainText } from './divination.ts';

/**
 * The Divination a character records is the maxim alone, as plain text: a rich-text
 * table result showed its HTML on the sheet and never matched the divination document
 * (named for the maxim), so its grants were never applied.
 */
describe('divinationMaxim', () => {
    it("takes a table result's bold maxim and drops its effect paragraph", () => {
        expect(divinationMaxim('<p><b>Trust in your fear.</b></p><p>Increase this character’s Perception by 5.</p>')).toBe('Trust in your fear.');
        expect(divinationMaxim('<p><strong>Mutation without, corruption within.</strong></p><p>Roll once on a table.</p>')).toBe(
            'Mutation without, corruption within.',
        );
    });

    it('falls back to the first paragraph, then to the whole text stripped', () => {
        expect(divinationMaxim('<p>Only the insane have strength enough to prosper.</p><p>Effect.</p>')).toBe(
            'Only the insane have strength enough to prosper.',
        );
        expect(divinationMaxim('<div>A <i>maxim</i></div>')).toBe('A maxim');
    });

    it('leaves plain text as it is, apart from whitespace', () => {
        expect(divinationMaxim('  Trust in your fear.  ')).toBe('Trust in your fear.');
        expect(divinationMaxim('Fear is a weapon < none')).toBe('Fear is a weapon < none');
    });

    it('decodes character references', () => {
        expect(divinationMaxim('<p><b>Don&rsquo;t ask &amp; serve&#33;</b></p>')).toBe('Don’t ask & serve!');
    });
});

describe('plainText', () => {
    it('removes tags, turns line breaks into spaces and collapses whitespace', () => {
        expect(plainText('<p>One<br/>two</p>\n<p>three</p>')).toBe('One two three');
    });
});
