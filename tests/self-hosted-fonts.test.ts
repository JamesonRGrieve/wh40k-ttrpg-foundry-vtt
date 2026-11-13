/**
 * Guard (#709): fonts load from the system, not Google.
 *
 * `entry.css` used to `@import` Google Fonts and Material Icons, a blocking
 * stylesheet request to a third host on every load. The files now ship in
 * `src/fonts/` with `@font-face` rules from `tailwind/fonts.js`, which also
 * holds the one definition of the font stacks the Tailwind theme and the
 * `--wh40k-font-*` tokens read.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkFiles } from '../scripts/lib/walk.mjs';

const ROOT = resolve(__dirname, '..');
const requireCjs = createRequire(import.meta.url);

interface FontFace {
    'font-family': string;
    'src': string;
}

interface FontsModule {
    fontStacks: Record<string, string[]>;
    stack: (families: string[]) => string;
    fontFaces: FontFace[];
}

interface TailwindConfig {
    theme: { extend: { fontFamily: Record<string, string[]> } };
}

const fonts = requireCjs(resolve(ROOT, 'tailwind/fonts.js')) as FontsModule;
const GOOGLE_HOST = /fonts\.(?:googleapis|gstatic)\.com/;

describe('fonts are served by the system (#709)', () => {
    it('no stylesheet, Tailwind plugin or template reaches Google Fonts', () => {
        const files = [
            ...walkFiles(resolve(ROOT, 'src/css'), { ext: '.css' }),
            ...walkFiles(resolve(ROOT, 'tailwind'), { ext: '.js' }),
            resolve(ROOT, 'tailwind.config.js'),
            ...walkFiles(resolve(ROOT, 'src/templates'), { ext: '.hbs' }),
        ];
        const offenders = files.filter((file: string) => GOOGLE_HOST.test(readFileSync(file, 'utf8')));
        expect(offenders).toEqual([]);
        expect(readFileSync(resolve(ROOT, 'src/css/entry.css'), 'utf8')).not.toMatch(/@import\s+url\(\s*['"]?https?:/);
    });

    it('every @font-face points at a file that ships in src/fonts', () => {
        const missing = fonts.fontFaces
            .map((face) => /url\('\.\.\/fonts\/([^']+)'\)/.exec(face.src)?.[1] ?? `unparsed: ${face.src}`)
            .filter((file) => !existsSync(join(ROOT, 'src/fonts', file)));
        expect(missing).toEqual([]);
        expect(new Set(fonts.fontFaces.map((face) => face['font-family']))).toEqual(
            new Set(["'Cinzel'", "'IM Fell DW Pica'", "'Lusitana'", "'Roboto'", "'Material Icons'"]),
        );
    });

    it('ships a licence for every vendored family, and the build copies src/fonts', () => {
        expect(readdirSync(resolve(ROOT, 'src/fonts/licenses')).sort()).toEqual([
            'Cinzel-OFL.txt',
            'IMFellDWPica-OFL.txt',
            'Lusitana-OFL.txt',
            'MaterialIcons-Apache-2.0.txt',
            'Roboto-OFL.txt',
        ]);
        expect(readFileSync(resolve(ROOT, 'gulpfile.js'), 'utf8')).toContain('"src/fonts/**/*"');
    });

    it('keeps one definition of the font stacks: the Tailwind theme and the tokens read it', () => {
        const config = requireCjs(resolve(ROOT, 'tailwind.config.js')) as TailwindConfig;
        const theme = config.theme.extend.fontFamily;
        const shared = ['display', 'heading', 'body', 'ui', 'alt'].filter((role) => theme[role] !== fonts.fontStacks[role]);
        expect(shared).toEqual([]);
        const tokens = readFileSync(resolve(ROOT, 'tailwind/design-tokens.js'), 'utf8');
        expect(tokens).toContain("'--wh40k-font-body': stack(fontStacks.body)");
        expect(tokens).not.toMatch(/'--wh40k-font-[a-z]+':\s*"/);
    });
});
