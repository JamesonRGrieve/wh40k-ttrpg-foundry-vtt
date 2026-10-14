/**
 * Regression guard: text on the dark chat cards is legible (#635).
 *
 * - The BC Ascension, Psychic Test and Chaos Ritual cards drew their title and
 *   accents in `crimson` (#8b0000) on a near-black red panel (≈1.9:1).
 * - The daemonology ritual card's breakdown rows (the shared modifier-breakdown
 *   partial) and attempts table inherited dark text on a black panel.
 * - The Sanctic Purity "negated" card's DH2 variant replaced its dark panel
 *   with a 30% amber wash, so its gold title sat on the tan chat background.
 *
 * Dark cards now declare `data-wh40k-surface="dark"`, whose tokens
 * (tailwind/design-tokens.js) re-point the text tokens to light values.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '..');

const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');

interface Rgb {
    r: number;
    g: number;
    b: number;
}

function hexRgb(hex: string): Rgb {
    return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}

function channel(v: number): number {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgb): number {
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** A card panel `rgba(r, g, b, alpha)` composited over the chat message underneath. */
function over(panel: Rgb, alpha: number, under: Rgb): Rgb {
    const mix = (top: number, bottom: number): number => top * alpha + bottom * (1 - alpha);
    return { r: mix(panel.r, under.r), g: mix(panel.g, under.g), b: mix(panel.b, under.b) };
}

/** Foundry's light parchment chat message: the worst case under a translucent card. */
const PARCHMENT: Rgb = { r: 235, g: 225, b: 205 };

/** The `'key': 'value'` pairs of a JS object literal named `name` in `source`. */
function objectLiteral(source: string, name: string): Map<string, string> {
    const body = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(source)?.[1] ?? '';
    return new Map([...body.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => [m[1], m[2]]));
}

const DARK_CARDS = [
    'src/templates/chat/bc-ascension-chat.hbs',
    'src/templates/chat/bc-psychic-test-chat.hbs',
    'src/templates/chat/bc-ritual-chat.hbs',
    'src/templates/chat/daemonology-ritual-chat.hbs',
    'src/templates/chat/sanctic-purity-negated-chat.hbs',
    'src/templates/chat/sanctic-daemonology-chat.hbs',
];

describe('dark chat cards', () => {
    it('each declares the dark surface on its root', () => {
        expect(DARK_CARDS.filter((card) => !read(card).includes('data-wh40k-surface="dark"'))).toEqual([]);
    });

    it('no BC card draws text in the dark crimson the panel is tinted with', () => {
        expect(DARK_CARDS.filter((card) => card.includes('/bc-') && /bc:tw-text-crimson(?![-\w])/.test(read(card)))).toEqual([]);
    });

    it('the Sanctic cards keep an opaque dark panel on DH2 (no translucent amber wash)', () => {
        expect(DARK_CARDS.filter((card) => card.includes('sanctic') && read(card).includes('dh2:tw-bg-amber-900/30'))).toEqual([]);
    });
});

describe('dark surface tokens (design-tokens.js)', () => {
    const tokensSource = read('tailwind/design-tokens.js');
    const surface = objectLiteral(tokensSource, 'darkSurface');

    it('is applied to the data-wh40k-surface="dark" scope', () => {
        expect(tokensSource).toContain(`'[data-wh40k-surface="dark"]': darkSurface`);
    });

    it('re-points the text tokens the breakdown partial and cards read', () => {
        const keys = ['color', '--wh40k-card-text', '--wh40k-card-muted', '--wh40k-text-bright', '--wh40k-text-medium', '--wh40k-text-muted'];
        expect(keys.filter((key) => !/^#[0-9a-f]{6}$/i.test(surface.get(key) ?? ''))).toEqual([]);
    });

    it('every text token clears WCAG AA (4.5:1) on each dark card panel over the light chat background', () => {
        const panels: Array<{ rgb: Rgb; alpha: number }> = [
            { rgb: { r: 20, g: 8, b: 8 }, alpha: 0.88 }, // BC cards
            { rgb: { r: 16, g: 8, b: 12 }, alpha: 0.9 }, // daemonology ritual
            { rgb: { r: 15, g: 12, b: 8 }, alpha: 0.85 }, // sanctic (non-DH2)
            { rgb: { r: 45, g: 28, b: 6 }, alpha: 0.92 }, // sanctic (DH2)
        ];
        const failing = panels.flatMap(({ rgb, alpha }) =>
            [...surface.entries()]
                .filter(([, value]) => value.startsWith('#'))
                .filter(([, value]) => contrast(hexRgb(value), over(rgb, alpha, PARCHMENT)) < 4.5)
                .map(([key]) => `${key} on rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`),
        );
        expect(failing).toEqual([]);
    });

    it('the BC accent crimson used on those cards clears 4.5:1 too', () => {
        const l40 = /crimson: \{[^}]*'l40': '(#[0-9a-f]{6})'/i.exec(read('tailwind.config.js'))?.[1] ?? '#000000';
        expect(contrast(hexRgb(l40), over({ r: 20, g: 8, b: 8 }, 0.88, PARCHMENT))).toBeGreaterThanOrEqual(4.5);
    });
});

describe('chat message surface tokens (design-tokens.js)', () => {
    const tokensSource = read('tailwind/design-tokens.js');
    const surface = objectLiteral(tokensSource, 'chatSurface');
    const dark = objectLiteral(tokensSource, 'darkSurface');

    /** Foundry's chat message backgrounds: the parchment message and the whisper / emote / blind tints. */
    const MESSAGES: Rgb[] = [PARCHMENT, hexRgb('#e8e8ef'), hexRgb('#f3edde'), hexRgb('#f5eaf5')];
    /** The translucent washes chat cards lay over the message (the light panel, then each semantic callout). */
    const WASHES: Array<{ rgb: Rgb; alpha: number }> = [
        { rgb: { r: 255, g: 255, b: 255 }, alpha: 0.35 }, // --wh40k-panel-bg-translucent (light)
        { rgb: { r: 139, g: 0, b: 0 }, alpha: 0.08 }, // --wh40k-wounds-bg
        { rgb: { r: 217, g: 119, b: 6 }, alpha: 0.1 }, // --wh40k-warning-bg
        { rgb: { r: 220, g: 38, b: 38 }, alpha: 0.1 }, // --wh40k-danger-bg
        { rgb: { r: 45, g: 90, b: 45 }, alpha: 0.1 }, // --wh40k-success-bg
        { rgb: { r: 106, g: 32, b: 144 }, alpha: 0.08 }, // --wh40k-powers-bg
        { rgb: { r: 37, g: 99, b: 235 }, alpha: 0.08 }, // --wh40k-fate-bg
    ];

    it('is applied to every chat message and spreads the light theme (no dark panel wash on parchment)', () => {
        expect(tokensSource).toContain(`'.chat-message': chatSurface`);
        expect(tokensSource).toMatch(/const chatSurface = \{\s*\.\.\.lightTheme,/);
    });

    it('the dark surface is declared after the chat surface, so a dark card inside a message keeps its own tokens', () => {
        expect(tokensSource.indexOf(`'[data-wh40k-surface="dark"]': darkSurface`)).toBeGreaterThan(tokensSource.indexOf(`'.chat-message': chatSurface`));
    });

    it('every text token clears WCAG AA (4.5:1) on each chat message under each card wash', () => {
        const backgrounds = MESSAGES.flatMap((message) => [message, ...WASHES.map(({ rgb, alpha }) => over(rgb, alpha, message))]);
        const failing = [...surface.entries()]
            .filter(([, value]) => value.startsWith('#'))
            .filter(([, value]) => backgrounds.some((bg) => contrast(hexRgb(value), bg) < 4.5))
            .map(([key]) => key);
        expect(failing).toEqual([]);
    });

    it('a dark card re-points every colour the chat surface sets, so none leaks dark-on-dark', () => {
        const missing = [...surface.keys()].filter((key) => surface.get(key)?.startsWith('#') === true && !dark.has(key));
        expect(missing).toEqual([]);
    });
});
