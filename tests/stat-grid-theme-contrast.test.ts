/**
 * Regression (#260): the stat-grid cells (movement, athletics, carrying capacity)
 * hard-coded a white wash (`tw-bg-white/50`), which turned grey on the dark sheet
 * theme and left the gold icon, muted label and value barely readable. The cell
 * now takes its background and value colour from the theme tokens, which this
 * guard measures on both themes.
 */

import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const grid = readRepoFile('src/templates/actor/partial/stat-grid-section.hbs');
const movementFull = readRepoFile('src/templates/actor/panel/movement-panel-full.hbs');
const tokens = readRepoFile('tailwind/design-tokens.js');

/** What lies under the translucent sheet background on each theme. */
const THEMES: ReadonlyArray<{ name: string; tokens: Map<string, string>; base: Rgb }> = [
    { name: 'light', tokens: objectLiteral(tokens, 'lightTheme'), base: hexRgb('#ffffff') },
    { name: 'dark', tokens: objectLiteral(tokens, 'darkTheme'), base: hexRgb('#000000') },
];

/** The token's colour composited over `under`. */
function layer(themeTokens: Map<string, string>, token: string, under: Rgb): Rgb {
    const { rgb, alpha } = parseColour(themeTokens.get(token) ?? '');
    return over(rgb, alpha, under);
}

describe('stat-grid cells use the theme tokens (#260)', () => {
    it('no fixed white wash or Foundry-core text colour on the cell', () => {
        expect(grid).not.toMatch(/tw-bg-white/);
        expect(grid).not.toContain('--color-text-primary');
        expect(grid).toContain('tw-bg-[var(--wh40k-panel-bg)]');
        expect(grid).toContain('hover:tw-bg-[var(--wh40k-panel-bg-solid)]');
        expect(grid).toContain('tw-text-[color:var(--wh40k-text-dark)]');
    });

    it('the movement panel size select is themed the same way', () => {
        expect(movementFull).not.toContain('tw-bg-[rgba(255,255,255,0.8)]');
        expect(movementFull).toContain('tw-bg-[var(--wh40k-input-bg)]');
    });

    it.each(THEMES)('on the $name theme the value clears 4.5:1 and the label 3:1, at rest and hovered', ({ tokens: themeTokens, base }) => {
        const sheet = layer(themeTokens, '--wh40k-sheet-bg', base);
        for (const cellToken of ['--wh40k-panel-bg', '--wh40k-panel-bg-solid']) {
            const cell = layer(themeTokens, cellToken, sheet);
            expect(contrast(parseColour(themeTokens.get('--wh40k-text-dark') ?? '').rgb, cell), `value on ${cellToken}`).toBeGreaterThanOrEqual(4.5);
            expect(contrast(parseColour(themeTokens.get('--wh40k-text-muted') ?? '').rgb, cell), `label on ${cellToken}`).toBeGreaterThanOrEqual(3);
        }
    });
});
