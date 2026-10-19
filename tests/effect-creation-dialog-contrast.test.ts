/**
 * Regression (#651): the Create Active Effect dialog drew its labels, values,
 * hints and tab captions in fixed white over black washes. Every colour in the
 * template is now a token.
 *
 * System dialogs stay dark on both themes (operator ruling, #667): the dialog sits
 * on the dark window body and declares `data-wh40k-surface="dark"`, so its tokens
 * resolve to their light-on-dark values whichever theme the world uses. This
 * measures each text/background pairing the dialog uses under each theme, on that
 * dark body, and checks the ground stays dark. Tier B
 * (effect-creation-contrast.spec.ts) scans the rendered dialog on both themes.
 */

import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, parseColour, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const tokens = readRepoFile('tailwind/design-tokens.js');
const palette = objectLiteral(tokens, 'palette');
const semantic = objectLiteral(tokens, 'semantic');
const darkSurface = objectLiteral(tokens, 'darkSurface');
const template = readRepoFile('src/templates/dialogs/effect-creation-dialog.hbs');
const dialogSource = readRepoFile('src/module/applications/prompts/effect-creation-dialog.ts');

/** The system window body every dialog sits on: `--color-bg-primary`'s fallback, on both themes. */
const WINDOW_BODY = hexRgb('#1a1a1a');

/** Each theme's tokens, with the dark surface the dialog declares laid over them. */
const THEMES: ReadonlyArray<{ name: string; tokens: Map<string, string> }> = ['lightTheme', 'darkTheme'].map((theme) => ({
    name: theme === 'lightTheme' ? 'light' : 'dark',
    // `darkSurface` spreads `darkTheme` (which `objectLiteral` doesn't follow), then overrides some tokens.
    tokens: new Map([...objectLiteral(tokens, theme), ...objectLiteral(tokens, 'darkTheme'), ...darkSurface]),
}));

/** A token's value on a theme: the theme's own (under the dark surface), else the theme-invariant one. */
function token(themeTokens: Map<string, string>, name: string): string {
    return themeTokens.get(name) ?? semantic.get(name) ?? palette.get(name) ?? '';
}

/** `value` composited over `under`. */
function layer(value: string, under: Rgb): Rgb {
    const { rgb, alpha } = parseColour(value);
    return over(rgb, alpha, under);
}

/** The ground a stack of background tokens (outermost first) makes on the dark window body. */
function ground(themeTokens: Map<string, string>, backgrounds: readonly string[]): Rgb {
    return backgrounds.reduce((under, name) => layer(token(themeTokens, name), under), WINDOW_BODY);
}

/** Relative luminance, 0 (black) to 1 (white). */
function luminance({ r, g, b }: Rgb): number {
    const lin = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
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

/** The panel grounds the dialog's text sits on; each must stay dark. */
const PANEL_GROUNDS: ReadonlyArray<readonly string[]> = [
    ['--wh40k-panel-bg'],
    ['--wh40k-panel-bg', '--wh40k-input-bg'],
    ['--wh40k-panel-bg-translucent', '--wh40k-btn-bg'],
];

describe('Create Active Effect dialog colours (#651)', () => {
    it('uses no fixed white, black or hex colour', () => {
        expect(template.match(/tw-[\w:[\]&>-]*(white|black)\b[\w/]*|\[#[0-9a-f]{3,8}\]/gi) ?? []).toEqual([]);
    });

    it('names a token for every text colour', () => {
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

    it('declares the dark surface, and paints no surface of its own over the dark window body', () => {
        expect(template).toMatch(/<div class="[^"]*" data-wh40k-surface="dark">/);
        expect(template).not.toContain('--wh40k-sheet-bg');
        expect(dialogSource).not.toContain('contentClasses');
        // The model above relies on the dark surface carrying every dark-theme token.
        expect(tokens).toMatch(/const darkSurface = \{\s*\.\.\.darkTheme,/);
    });

    it('sets each white condition icon on the dark icon tile', () => {
        expect(template).toMatch(/<img src="\{\{condition\.img\}\}"[^>]*tw-bg-\[var\(--wh40k-icon-tile\)\]/);
        expect(contrast(hexRgb('#ffffff'), parseColour(palette.get('--wh40k-icon-tile') ?? '').rgb)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(THEMES)('stays dark on the $name theme', ({ tokens: themeTokens }) => {
        const light = PANEL_GROUNDS.map((backgrounds) => luminance(ground(themeTokens, backgrounds))).filter((value) => value > 0.1);
        expect(light).toEqual([]);
    });

    it.each(THEMES)('every text pairing clears 4.5:1 on the $name theme', ({ tokens: themeTokens }) => {
        const failing = PAIRS.flatMap(({ label, text, backgrounds }) => {
            const value = contrast(parseColour(token(themeTokens, text)).rgb, ground(themeTokens, backgrounds));
            return value >= 4.5 ? [] : [`${label}: ${value.toFixed(2)}:1`];
        });
        expect(failing).toEqual([]);
    });
});
