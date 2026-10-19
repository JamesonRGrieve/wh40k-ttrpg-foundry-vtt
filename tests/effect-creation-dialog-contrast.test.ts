/**
 * Regression (#651): the Create Active Effect dialog drew its labels, values,
 * hints and tab captions in fixed white over black washes. On the light theme
 * that is white on parchment, unreadable. Every colour in the template is now a
 * theme token; this measures each text/background pairing it uses on both themes.
 * Tier B (effect-creation-contrast.spec.ts) scans the rendered dialog.
 */

import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const tokens = readRepoFile('tailwind/design-tokens.js');
const palette = objectLiteral(tokens, 'palette');
const semantic = objectLiteral(tokens, 'semantic');
const template = readRepoFile('src/templates/dialogs/effect-creation-dialog.hbs');

const THEMES: ReadonlyArray<{ name: string; tokens: Map<string, string>; base: Rgb }> = [
    { name: 'light', tokens: objectLiteral(tokens, 'lightTheme'), base: hexRgb('#ffffff') },
    { name: 'dark', tokens: objectLiteral(tokens, 'darkTheme'), base: hexRgb('#000000') },
];

/** A token's value on a theme: the theme's own, else the theme-invariant one. */
function token(themeTokens: Map<string, string>, name: string): string {
    return themeTokens.get(name) ?? semantic.get(name) ?? palette.get(name) ?? '';
}

/** `value` composited over `under`. */
function layer(value: string, under: Rgb): Rgb {
    const { rgb, alpha } = parseColour(value);
    return over(rgb, alpha, under);
}

/** Text token over a stack of background tokens (outermost first), on the window's sheet background. */
function ratio(themeTokens: Map<string, string>, base: Rgb, text: string, backgrounds: readonly string[]): number {
    const sheet = layer(token(themeTokens, '--wh40k-sheet-bg'), base);
    const ground = backgrounds.reduce((under, name) => layer(token(themeTokens, name), under), sheet);
    return contrast(parseColour(token(themeTokens, text)).rgb, ground);
}

/** Each text colour the dialog uses, on the backgrounds it sits on. */
const PAIRS: ReadonlyArray<{ label: string; text: string; backgrounds: readonly string[] }> = [
    { label: 'tab caption', text: '--wh40k-text-muted', backgrounds: ['--wh40k-panel-bg-translucent', '--wh40k-btn-bg'] },
    { label: 'section heading', text: '--wh40k-accent-gold-text', backgrounds: ['--wh40k-panel-bg'] },
    { label: 'field label', text: '--wh40k-text-dark', backgrounds: ['--wh40k-panel-bg'] },
    { label: 'hint', text: '--wh40k-text-muted', backgrounds: ['--wh40k-panel-bg'] },
    { label: 'input value', text: '--wh40k-text-dark', backgrounds: ['--wh40k-panel-bg', '--wh40k-input-bg'] },
    { label: 'input placeholder', text: '--wh40k-text-muted', backgrounds: ['--wh40k-panel-bg', '--wh40k-input-bg'] },
    { label: 'condition name', text: '--wh40k-text-dark', backgrounds: ['--wh40k-panel-bg', '--wh40k-btn-bg'] },
    { label: 'cancel button', text: '--wh40k-text-dark', backgrounds: ['--wh40k-panel-bg-translucent', '--wh40k-btn-bg'] },
    { label: 'create button', text: '--wh40k-text-on-gold', backgrounds: ['--wh40k-accent-gold'] },
];

describe('Create Active Effect dialog colours (#651)', () => {
    it('uses no fixed white, black or hex colour', () => {
        expect(template.match(/tw-[\w:[\]&>-]*(white|black)\b[\w/]*|\[#[0-9a-f]{3,8}\]/gi) ?? []).toEqual([]);
    });

    it('names a theme token for every text colour', () => {
        const textColours = template.match(/tw-text-\[color:var\(--wh40k-[\w-]+\)\]/g) ?? [];
        expect(new Set(textColours)).toEqual(
            new Set([
                'tw-text-[color:var(--wh40k-text-muted)]',
                'tw-text-[color:var(--wh40k-accent-gold-text)]',
                'tw-text-[color:var(--wh40k-text-dark)]',
                'tw-text-[color:var(--wh40k-text-on-gold)]',
            ]),
        );
    });

    it('sets each white condition icon on the dark icon tile', () => {
        expect(template).toMatch(/<img src="\{\{condition\.img\}\}"[^>]*tw-bg-\[var\(--wh40k-icon-tile\)\]/);
        expect(contrast(hexRgb('#ffffff'), parseColour(palette.get('--wh40k-icon-tile') ?? '').rgb)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(THEMES)('every text pairing clears 4.5:1 on the $name theme', ({ tokens: themeTokens, base }) => {
        const failing = PAIRS.flatMap(({ label, text, backgrounds }) => {
            const value = ratio(themeTokens, base, text, backgrounds);
            return value >= 4.5 ? [] : [`${label}: ${value.toFixed(2)}:1`];
        });
        expect(failing).toEqual([]);
    });
});
