import { describe, expect, it } from 'vitest';
import { truncate } from './handlebars-helpers.ts';

/**
 * `truncate` (#613), registered as the `{{truncate text length}}` helper the
 * journal panel and the NPC template selector call. It returns plain text: the
 * helper's output is escaped, so HTML must not come back.
 */
describe('truncate', () => {
    it('cuts plain text at the length with an ellipsis', () => {
        expect(truncate('abcdefghij', 4)).toBe('abcd…');
    });

    it('returns short text whole', () => {
        expect(truncate('short', 10)).toBe('short');
    });

    it('strips HTML whether or not it cuts', () => {
        expect(truncate('<p>A <strong>brief</strong> note.</p>', 150)).toBe('A brief note.');
        expect(truncate('<p>A <strong>longer</strong> note.</p>', 8)).toBe('A longer…');
    });

    it('defaults to 100 characters', () => {
        expect(truncate('x'.repeat(120))).toBe(`${'x'.repeat(100)}…`);
    });
});
