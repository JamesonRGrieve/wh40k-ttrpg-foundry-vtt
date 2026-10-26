/**
 * Regressions from reading the chat cards under the dark theme (#698).
 *
 * - The damage card's hit badge — the hit number on a `--wh40k-card-gold` disc — drew
 *   its number in Foundry's `--color-bg-primary`, a core theme token. Under the dark
 *   theme that resolved to near-black on the chat message's deep gold (#6e500c),
 *   2.5:1. The badge now draws `--wh40k-card-gold-ink`, which each card surface pairs
 *   with its own gold.
 * - The force-field card's "Field Overload!" alarm was a fixed #ffd700 on the fate
 *   wash, 1.2:1 on the parchment message on either theme. It now draws the warning
 *   tokens, which the chat surface sets for parchment.
 */
import { describe, expect, it } from 'vitest';
import { contrast, hexRgb, objectLiteral, over } from './lib/contrast.ts';
import { readRepoFile } from './lib/repo-file.ts';

const TOKENS = readRepoFile('tailwind/design-tokens.js');

describe('the gold badge ink (#698)', () => {
    it.each(['chatSurface', 'darkSurface'])('reads at 4.5:1 on the %s gold', (surface) => {
        const tokens = objectLiteral(TOKENS, surface);
        const gold = tokens.get('--wh40k-card-gold') ?? '';
        const ink = tokens.get('--wh40k-card-gold-ink') ?? '';
        expect(
            [gold, ink].every((hex) => /^#[0-9a-f]{6}$/iu.test(hex)),
            `${surface} declares both`,
        ).toBe(true);
        expect(contrast(hexRgb(ink), hexRgb(gold))).toBeGreaterThanOrEqual(4.5);
    });

    it('is what every gold-filled chat element draws its text in', () => {
        const card = readRepoFile('src/templates/chat/damage-roll-chat.hbs');
        const fills = [...card.matchAll(/class="([^"]*tw-bg-\[var\(--wh40k-card-gold\)\][^"]*)"/gu)].map((m) => m[1]);
        expect(fills.length).toBeGreaterThan(0);
        expect(fills.every((classes) => classes.includes('tw-text-[var(--wh40k-card-gold-ink)]'))).toBe(true);
    });
});

describe('the force-field overload alarm (#698)', () => {
    const card = readRepoFile('src/templates/chat/force-field-roll-chat.hbs');
    const marker = card.indexOf('data-force-field-overload');
    // From the alarm's own element (its classes precede the marker) to the end of its block.
    const block = card.slice(card.lastIndexOf('<div', marker), card.indexOf('{{/if}}', marker));

    it('draws the warning tokens, and no fixed colour', () => {
        expect(block).toContain('tw-text-[var(--wh40k-warning-secondary)]');
        expect(block).toContain('tw-bg-[var(--wh40k-warning-bg)]');
        expect(block).not.toMatch(/#[0-9a-f]{6}/iu);
    });

    it('whose chat colour reads at 4.5:1 on the warning wash over the parchment', () => {
        const ink = objectLiteral(TOKENS, 'chatSurface').get('--wh40k-warning-secondary') ?? '';
        // --wh40k-warning-bg is rgba(217, 119, 6, 0.1) over the parchment message.
        expect(contrast(hexRgb(ink), over({ r: 217, g: 119, b: 6 }, 0.1, { r: 235, g: 225, b: 205 }))).toBeGreaterThanOrEqual(4.5);
    });
});
