/**
 * Guard for the border reset in tailwind.config.js. Preflight is off, so
 * `tw-border-solid` alone would leave every side at the browser's `medium` width;
 * the config zeroes the width of `.tw-border-solid` and lets each class list's own
 * width utility put back the sides it wants. That is only safe while every class
 * list using `tw-border-solid` declares a width — this test holds that line, and
 * checks the reset is still registered.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

/** A border-width utility: all sides or one axis/side, a scale step or an arbitrary length, under any variant. */
const BORDER_WIDTH = /^(?:[a-z0-9-]+:)*tw-border(?:-[lrtbxy])?(?:-\d+|-\[\d[^\]]*\])?$/u;

/** Repo-relative paths under `dir` whose name ends with `ext`, excluding tests and stories. */
function sourceFiles(dir: string, ext: string): string[] {
    return readdirSync(join(ROOT, dir), { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith(ext) && !name.endsWith('.test.ts') && !name.endsWith('.stories.ts'))
        .map((name) => join(dir, name));
}

function classListsWithoutWidth(): string[] {
    const files = [...sourceFiles('src/templates', '.hbs'), ...sourceFiles('src/module', '.ts')];
    const offenders: string[] = [];
    for (const file of files) {
        const lines = readFileSync(join(ROOT, file), 'utf8').split('\n');
        lines.forEach((line, index) => {
            for (const match of line.matchAll(/class="([^"]*)"/gu)) {
                const classes = match[1].split(/\s+/u);
                if (classes.includes('tw-border-solid') && !classes.some((c) => BORDER_WIDTH.test(c))) {
                    offenders.push(`${file}:${String(index + 1)}`);
                }
            }
        });
    }
    return offenders;
}

describe('tw-border-solid width reset', () => {
    it('is registered in tailwind.config.js', () => {
        expect(readFileSync(join(ROOT, 'tailwind.config.js'), 'utf8')).toContain(`'.wh40k-rpg .tw-border-solid': { 'border-width': '0' }`);
    });

    it('every class list using tw-border-solid declares its own border width', () => {
        expect(classListsWithoutWidth()).toEqual([]);
    });
});
