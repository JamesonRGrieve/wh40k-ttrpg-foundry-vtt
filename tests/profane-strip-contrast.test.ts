/**
 * Regression (#660): the gear sheet's Profane Object strip drew its heading, the
 * aura line and the hook label in `crimson-light` on a maroon wash (~2:1), and its
 * header chip was red text on a red fill. The strip and chip now take theme text
 * and a themed danger red, measured here on the crimson wash on both themes.
 */

import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const tokens = readRepoFile('tailwind/design-tokens.js');
const sheet = readRepoFile('src/templates/item/item-gear-sheet.hbs');

/** The palette `crimson` (tailwind.config.js) at the strip's and chip's 10% wash. */
const CRIMSON = hexRgb('#8b0000');
const WASH_ALPHA = 0.1;

const THEMES: ReadonlyArray<{ name: string; tokens: Map<string, string>; base: Rgb }> = [
    { name: 'light', tokens: objectLiteral(tokens, 'lightTheme'), base: hexRgb('#ffffff') },
    { name: 'dark', tokens: objectLiteral(tokens, 'darkTheme'), base: hexRgb('#000000') },
];

describe('Profane Object strip (#660)', () => {
    it('draws no crimson-light text and no red fill under red text', () => {
        const strip = /data-wh40k-hook="gear-profane-panel"[\s\S]*?<\/section>/.exec(sheet)?.[0] ?? '';
        const chip = /data-wh40k-hook="gear-profane-badge"[^>]*>/.exec(sheet)?.[0] ?? '';
        expect(strip).not.toBe('');
        expect(`${strip}${chip}`).not.toContain('tw-text-crimson-light');
        expect(chip).not.toMatch(/tw-bg-crimson\/[4-9]\d/);
    });

    it.each(THEMES)('its text clears 4.5:1 on the crimson wash on the $name theme', ({ tokens: themeTokens, base }) => {
        const { rgb: sheetRgb, alpha: sheetAlpha } = parseColour(themeTokens.get('--wh40k-sheet-bg') ?? '');
        const wash = over(CRIMSON, WASH_ALPHA, over(sheetRgb, sheetAlpha, base));
        const failing = ['--wh40k-danger-text', '--wh40k-text-dark', '--wh40k-text-muted'].flatMap((name) => {
            const ratio = contrast(parseColour(themeTokens.get(name) ?? '').rgb, wash);
            return ratio >= 4.5 ? [] : [`${name}: ${ratio.toFixed(2)}:1`];
        });
        expect(failing).toEqual([]);
    });
});
