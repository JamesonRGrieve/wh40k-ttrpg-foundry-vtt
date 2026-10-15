/**
 * Regression (#655): the Trait item sheet's active tab drew its label in
 * `--wh40k-traits-primary` (#6a2090) on a purple wash, purple on purple and close
 * to invisible on the dark sheet, and the sidebar's Level value used the same
 * colour. The accent strip (`item/partial/item-accent-tab-strip.hbs`) is shared
 * by the talent, trait and origin-path (dynasty) sheets, so each category's active
 * label is measured on both themes.
 */

import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const tokens = readRepoFile('tailwind/design-tokens.js');
const semantic = objectLiteral(tokens, 'semantic');
const traitSheet = readRepoFile('src/templates/item/item-trait-sheet.hbs');

/** What lies under the translucent sheet background on each theme. */
const THEMES: ReadonlyArray<{ name: string; tokens: Map<string, string>; base: Rgb }> = [
    { name: 'light', tokens: objectLiteral(tokens, 'lightTheme'), base: hexRgb('#ffffff') },
    { name: 'dark', tokens: objectLiteral(tokens, 'darkTheme'), base: hexRgb('#000000') },
];

const CATEGORIES = ['talents', 'traits', 'dynasty'] as const;

/** A token's value on a theme: the theme's own, else the theme-invariant one. */
function token(themeTokens: Map<string, string>, name: string): string {
    return themeTokens.get(name) ?? semantic.get(name) ?? '';
}

function layer(value: string, under: Rgb): Rgb {
    const { rgb, alpha } = parseColour(value);
    return over(rgb, alpha, under);
}

describe('accent tab strip (#655)', () => {
    it.each(THEMES)('each category’s active label clears 4.5:1 on the $name theme', ({ tokens: themeTokens, base }) => {
        const sheet = layer(token(themeTokens, '--wh40k-sheet-bg'), base);
        const strip = layer(token(themeTokens, '--wh40k-panel-bg-solid'), sheet);
        const failing = CATEGORIES.flatMap((category) => {
            const tab = layer(token(themeTokens, `--wh40k-${category}-bg`), strip);
            const ratio = contrast(parseColour(token(themeTokens, `--wh40k-${category}-primary`)).rgb, tab);
            return ratio >= 4.5 ? [] : [`${category}: ${ratio.toFixed(2)}:1`];
        });
        expect(failing).toEqual([]);
    });

    it('the accent label colours are themed, not one value for both themes', () => {
        expect(CATEGORIES.filter((category) => semantic.has(`--wh40k-${category}-primary`))).toEqual([]);
    });

    it('the trait sheet’s Level value uses the themed token, without a fixed fallback', () => {
        expect(traitSheet).not.toContain('--wh40k-traits-primary,#6a2090');
    });
});
