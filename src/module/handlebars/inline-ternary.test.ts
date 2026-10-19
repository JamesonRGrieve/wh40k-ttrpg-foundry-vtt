/**
 * `iff` helper logic (#229 story scan). Handlebars appends its options object
 * as the last argument, so `(iff cond "x")` used to return that object when
 * `cond` was false — printing "[object Object]" into the fate, wounds and
 * fatigue panels' class attributes.
 */
import Hbs from 'handlebars';
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { inlineTernary } from './inline-ternary.ts';

/** Stand-in for the options object Handlebars passes as the final argument. */
const OPTIONS = { hash: {}, data: {}, name: 'iff' };

describe('inlineTernary', () => {
    it('returns the true branch for a truthy condition', () => {
        expect(inlineTernary([true, 'yes', 'no', OPTIONS])).toBe('yes');
        expect(inlineTernary([1, 'yes', OPTIONS])).toBe('yes');
    });

    it('returns the false branch for a falsy condition', () => {
        expect(inlineTernary([false, 'yes', 'no', OPTIONS])).toBe('no');
    });

    it('defaults the omitted false branch to "" instead of the options object', () => {
        expect(inlineTernary([false, 'yes', OPTIONS])).toBe('');
        expect(inlineTernary([0, 'yes', OPTIONS])).toBe('');
        expect(inlineTernary(['', 'yes', OPTIONS])).toBe('');
        expect(inlineTernary([null, 'yes', OPTIONS])).toBe('');
        expect(inlineTernary([undefined, 'yes', OPTIONS])).toBe('');
    });

    it('treats only undefined / null / false / 0 / "" as false, like the other system helpers', () => {
        expect(inlineTernary([[], 'yes', OPTIONS])).toBe('yes');
        expect(inlineTernary(['0', 'yes', OPTIONS])).toBe('yes');
    });

    it('renders an empty class, not "[object Object]", through a real Handlebars call', () => {
        const hbs = Hbs.create();
        hbs.registerHelper('iff', (...args: Array<object | string | boolean | undefined>) => inlineTernary(args));
        const tpl = hbs.compile('<div class="panel {{iff empty "is-empty"}}"></div>');
        expect(tpl({ empty: false })).toBe('<div class="panel "></div>');
        expect(tpl({ empty: true })).toBe('<div class="panel is-empty"></div>');
    });

    it('is the implementation behind the `iff` helper, which the story harness takes from production', () => {
        expect(readRepoFile('src/module/handlebars/handlebars-helpers.ts')).toContain(
            "registerHelper('iff', (...args: TplValue[]): TplValue => inlineTernary(args))",
        );
        // #613: the harness registers production's helpers, not a copy of its own.
        const harness = readRepoFile('stories/template-support.ts');
        expect(harness).toContain('registerHandlebarsHelpers(HandlebarsLib');
        expect(harness).not.toContain("registerHelper('iff'");
    });
});
