/**
 * Regression (#635): chat cards drew each line's sheet accent (DH2 `gold-raw`,
 * tuned for the dark sheet) on the parchment chat message, where it measured
 * 2.08:1. Every line now declares a `chatAccent` theme role, and light chat cards
 * draw it; this holds each line's chat accent to 4.5:1 on every chat message
 * background under every card wash, and keeps the sheet `accent` off light cards.
 */
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over, type Rgb } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

interface TailwindConfig {
    /** Each colour is one hex, or a map of shade → hex that a shade lookup can miss. */
    theme: { extend: { colors: Record<string, string | Partial<Record<string, string>>> } };
}

const requireCjs = createRequire(import.meta.url);
const palette = (requireCjs(join(process.cwd(), 'tailwind.config.js')) as TailwindConfig).theme.extend.colors;

const LINES = ['bc', 'dh1', 'dh2', 'dw', 'im', 'ow', 'rt'] as const;

/** Foundry's chat message backgrounds: the parchment message and the whisper / emote / blind tints. */
const MESSAGES: Rgb[] = [{ r: 235, g: 225, b: 205 }, hexRgb('#e8e8ef'), hexRgb('#f3edde'), hexRgb('#f5eaf5')];
/** The translucent washes chat cards lay over the message. */
const WASHES: Array<{ rgb: Rgb; alpha: number }> = [
    { rgb: { r: 255, g: 255, b: 255 }, alpha: 0.35 },
    { rgb: { r: 139, g: 0, b: 0 }, alpha: 0.08 },
    { rgb: { r: 217, g: 119, b: 6 }, alpha: 0.1 },
    { rgb: { r: 220, g: 38, b: 38 }, alpha: 0.1 },
    { rgb: { r: 45, g: 90, b: 45 }, alpha: 0.1 },
    { rgb: { r: 106, g: 32, b: 144 }, alpha: 0.08 },
    { rgb: { r: 37, g: 99, b: 235 }, alpha: 0.08 },
];
const BACKGROUNDS = MESSAGES.flatMap((message) => [message, ...WASHES.map(({ rgb, alpha }) => over(rgb, alpha, message))]);

/** A config's `chatAccent` palette token, e.g. `gold-raw-d30`. */
function chatAccent(line: string): string {
    return /chatAccent:\s*'([^']+)'/u.exec(readRepoFile(`src/module/config/game-systems/${line}-config.ts`))?.[1] ?? '';
}

/** A palette token's hex: the longest colour name it starts with, then that colour's shade (or DEFAULT). */
function paletteHex(tokenName: string): string {
    const names = Object.keys(palette)
        .filter((name) => tokenName === name || tokenName.startsWith(`${name}-`))
        .sort((a, b) => b.length - a.length);
    const name = names.at(0);
    if (name === undefined) return '';
    const colour = palette[name];
    if (typeof colour === 'string') return tokenName === name ? colour : '';
    const shade = tokenName === name ? 'DEFAULT' : tokenName.slice(name.length + 1);
    return colour[shade] ?? '';
}

describe('chat accent (#635)', () => {
    it.each(LINES)('the %s chat accent resolves to a palette colour', (line) => {
        expect(paletteHex(chatAccent(line))).toMatch(/^#[0-9a-f]{6}$/iu);
    });

    it.each(LINES)('the %s chat accent clears 4.5:1 on every chat background', (line) => {
        const colour = hexRgb(paletteHex(chatAccent(line)));
        const worst = Math.min(...BACKGROUNDS.map((bg) => contrast(colour, bg)));
        expect(worst).toBeGreaterThanOrEqual(4.5);
    });

    it("the weapon card's gold Damage button labels in dark text, readable across its gold gradient", () => {
        const card = readRepoFile('src/templates/chat/weapon-card-chat.hbs');
        const button = /<button[^>]*class="([^"]*)"[^>]*data-action="rollDamage"/u.exec(card)?.[1] ?? '';
        const text = /tw-text-\[(#[0-9a-f]{6})\]/iu.exec(button)?.[1] ?? '';
        expect(text, 'the button declares its text colour').toMatch(/^#[0-9a-f]{6}$/iu);
        // The button's gradient runs --wh40k-gold → --wh40k-gold-dark (design tokens); the hover keeps the lighter end.
        const tokens = objectLiteral(readRepoFile('tailwind/design-tokens.js'), 'palette');
        const stops = ['--wh40k-gold', '--wh40k-gold-dark'].map((name) => contrast(hexRgb(text), hexRgb(tokens.get(name) ?? '#000000')));
        expect(Math.min(...stops)).toBeGreaterThanOrEqual(4.5);
    });

    it('the ship assault test (boarding, Hit and Run, ramming) draws its TARGET in the sheet accent, on cards that are all dark (#698)', () => {
        const partial = 'systems/wh40k-rpg/templates/chat/partial/ship-assault-test.hbs';
        const dir = 'src/templates/chat';
        const consumers = readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' })
            .filter((name) => name.endsWith('.hbs') && readRepoFile(`${dir}/${name}`).includes(partial))
            .sort();
        expect(consumers.length).toBeGreaterThan(0);
        expect(consumers.filter((name) => !readRepoFile(`${dir}/${name}`).includes('data-wh40k-surface="dark"'))).toEqual([]);
        expect(readRepoFile('src/templates/chat/partial/ship-assault-test.hbs')).toContain('modifier-breakdown.hbs accentRole="accent"');
    });

    it.each(LINES)('the %s sheet accent clears 4.5:1 on the dark ship card panel over the parchment (#698)', (line) => {
        const accent = /\baccent:\s*'([^']+)'/u.exec(readRepoFile(`src/module/config/game-systems/${line}-config.ts`))?.[1] ?? '';
        const panel = over({ r: 8, g: 16, b: 28 }, 0.9, { r: 235, g: 225, b: 205 });
        expect(contrast(hexRgb(paletteHex(accent)), panel)).toBeGreaterThanOrEqual(4.5);
    });

    it('light chat cards draw the chat accent, never the sheet accent', () => {
        const dir = 'src/templates/chat';
        const templates = readdirSync(join(process.cwd(), dir), { recursive: true, encoding: 'utf8' }).filter((name) => name.endsWith('.hbs'));
        const offenders = templates.filter((name) => {
            const source = readRepoFile(`${dir}/${name}`);
            return source.includes("themeClassFor 'accent'") && !source.includes('data-wh40k-surface="dark"');
        });
        expect(offenders).toEqual([]);
    });
});
