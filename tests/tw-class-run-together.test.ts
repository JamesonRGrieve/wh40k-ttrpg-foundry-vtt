/**
 * Guard: no two Tailwind utilities run together in a template or a class
 * string. A colour-token rename dropped the space after `-l20` / `-l30` /
 * `-l40` in several places (`tw-text-crimson-l40tw-font-semibold`). That makes
 * one unknown class, so both utilities silently stop applying: the text loses
 * its colour and its size or weight, and no error is shown.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

/**
 * A `tw-` utility glued to the end of a preceding word or utility, or glued to a
 * following Handlebars output expression (`tw-text-crimson-l40{{themeClassFor 'accent'}}`
 * renders as one unknown class). Block tags (`{{#…}}`, `{{/…}}`, `{{else}}`,
 * `{{^…}}`), comments and partials after a utility emit no class text, so they
 * are not glue.
 */
const RUN_TOGETHER = /[a-zA-Z0-9\]]tw-[a-z]|tw-[^\s"'{}]*[a-zA-Z0-9\]]\{\{(?![#/^!>]|~?\s*else\b)/;

function filesUnder(dir: string, extensions: readonly string[]): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return filesUnder(path, extensions);
        return extensions.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
    });
}

function runTogether(files: readonly string[]): string[] {
    return files.flatMap((file) =>
        readFileSync(file, 'utf8')
            .split('\n')
            .flatMap((line, index) => (RUN_TOGETHER.test(line) ? [`${relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 160)}`] : [])),
    );
}

describe('Tailwind class lists', () => {
    it('flags a glued pair and nothing that is not one', () => {
        expect(RUN_TOGETHER.test('tw-text-crimson-l40tw-font-semibold')).toBe(true);
        expect(RUN_TOGETHER.test('tw-w-[2rem]tw-h-4')).toBe(true);
        expect(RUN_TOGETHER.test("tw-text-crimson-l40{{themeClassFor 'accent'}}")).toBe(true);
        expect(RUN_TOGETHER.test('tw-bg-[var(--x)]{{extraClass}}')).toBe(true);
        for (const fine of [
            'tw-text-crimson-l40 tw-font-semibold',
            'dh2:tw-bg-bronze',
            'hover:tw-opacity-100',
            'tw-bg-gold/10',
            '"tw-flex',
            '{{x}}tw-flex',
            "tw-text-gold {{themeClassFor 'accent'}}",
            'hover:tw-scale-110{{#if active}} tw-ring{{/if}}',
            'tw-text-crimson-l40{{else}}',
            'tw-text-crimson-l40{{~else}}',
            'tw-flex{{/if}}',
        ]) {
            expect(RUN_TOGETHER.test(fine)).toBe(false);
        }
    });

    it('keep every tw- utility separated by whitespace in templates', () => {
        expect(runTogether(filesUnder(resolve(ROOT, 'src/templates'), ['.hbs']))).toEqual([]);
    });

    it('keep every tw- utility separated by whitespace in module class strings', () => {
        const sources = filesUnder(resolve(ROOT, 'src/module'), ['.ts']).filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.stories.ts'));
        expect(runTogether(sources)).toEqual([]);
    });
});
