/**
 * Guard (#260, widened): no template paints a raw white wash (`tw-bg-white/50`,
 * `/60`, `/70`, or the faint `/5` / `/10`). A white wash is a light-theme
 * colour. On the dark sheet theme it drew grey slabs that the text on them
 * could not be read against: the voidcraft Extended/Manoeuvre Actions rows'
 * "Skill: …" sublines were grey on grey. Panels take the theme's panel tokens,
 * whose light values are those same washes.
 *
 * The tokens that replaced them are measured too. The text they carry (dark,
 * muted and gold labels) clears 4.5:1 on each one, on both themes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const ROOT = resolve(__dirname, '..');
const tokens = readRepoFile('tailwind/design-tokens.js');

function templates(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) return templates(path);
        return entry.name.endsWith('.hbs') ? [path] : [];
    });
}

/** What lies under the translucent sheet background on each theme. */
const THEMES: ReadonlyArray<{ name: string; tokens: Map<string, string>; base: Rgb }> = [
    { name: 'light', tokens: objectLiteral(tokens, 'lightTheme'), base: hexRgb('#ffffff') },
    { name: 'dark', tokens: objectLiteral(tokens, 'darkTheme'), base: hexRgb('#000000') },
];

function layer(value: string, under: Rgb): Rgb {
    const { rgb, alpha } = parseColour(value);
    return over(rgb, alpha, under);
}

describe('no raw white washes (#260)', () => {
    it('no template paints tw-bg-white/N', () => {
        const offenders = templates(resolve(ROOT, 'src/templates')).flatMap((file) =>
            readFileSync(file, 'utf8')
                .split('\n')
                .flatMap((line, index) => (/tw-bg-white\/\d/.test(line) ? [`${relative(ROOT, file)}:${index + 1}`] : [])),
        );
        expect(offenders).toEqual([]);
    });

    it.each(THEMES)('the replacement panel tokens carry readable text on the $name theme', ({ tokens: themeTokens, base }) => {
        const sheet = layer(themeTokens.get('--wh40k-sheet-bg') ?? '', base);
        const failing: string[] = [];
        // The resting surfaces; `--wh40k-btn-bg-hover` backs only hover states.
        for (const panel of ['--wh40k-panel-bg', '--wh40k-panel-bg-solid', '--wh40k-panel-bg-translucent']) {
            const surface = layer(themeTokens.get(panel) ?? '', sheet);
            for (const text of ['--wh40k-text-dark', '--wh40k-text-muted', '--wh40k-accent-gold-text']) {
                const ratio = contrast(parseColour(themeTokens.get(text) ?? '').rgb, surface);
                if (ratio < 4.5) failing.push(`${text} on ${panel}: ${ratio.toFixed(2)}:1`);
            }
        }
        expect(failing).toEqual([]);
    });
});
