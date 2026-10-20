import type { Page } from '@playwright/test';
import { showChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B: the attack card shows its weapon's qualities, and the chips read on the
 * chat message.
 *
 * The quality helpers looked the definitions up on `CONFIG.rt`, which nothing sets,
 * so the card's Active Qualities box rendered with no chips at all. And the chips
 * drew a fixed light green (#4bc073): that suited the dark card surface, but since
 * the chat cards take the parchment message's colours (#635) it measured about 2:1
 * there. This spec posts the card through Foundry's own template render, expects
 * one chip per quality, and measures each chip's text against its surface.
 */

const PREFIX = 'e2e-quality-chips';
const QUALITIES = ['reliable', 'accurate'] as const;
/** WCAG AA for body text. */
const MIN_TEXT_CONTRAST = 4.5;
const CHIP = 'span[data-tooltip].tw-cursor-help';

interface ProbeWindow {
    foundry: { applications: { handlebars: { renderTemplate: (path: string, data: object) => Promise<string> } } };
    ChatMessage: { create: (data: object) => Promise<{ id: string } | null> };
    game: { messages: { filter: (fn: (m: { flavor: string }) => boolean) => Array<{ delete: () => Promise<void> }> } };
}

async function postActionCard(page: Page): Promise<string> {
    return page.evaluate(
        async ({ flavor, qualities }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            const content = await w.foundry.applications.handlebars.renderTemplate('systems/wh40k-rpg/templates/chat/action-roll-chat.hbs', {
                label: 'Semi-Auto Burst',
                rollData: { name: 'Lasgun', action: 'Attack', weapon: { system: { effectiveSpecial: new Set(qualities) } } },
            });
            const message = await w.ChatMessage.create({ content, flavor });
            if (message === null) throw new Error('ChatMessage.create returned null');
            return message.id;
        },
        { flavor: PREFIX, qualities: [...QUALITIES] },
    );
}

test.describe.serial('attack-card quality chips read on the chat message (Tier B)', () => {
    test.afterEach(async ({ page }) => {
        await page.evaluate(async (prefix) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context Foundry globals have no repo types
            const w = globalThis as unknown as ProbeWindow;
            for (const message of w.game.messages.filter((m) => m.flavor === prefix)) await message.delete();
        }, PREFIX);
    });

    test('each quality chip meets WCAG AA on its surface', async ({ page }) => {
        await joinOrSkip(page);
        const messageId = await postActionCard(page);
        const message = await showChatMessage(page, messageId);
        const chips = page.locator(`${message} ${CHIP}`);
        await expect(chips).toHaveCount(QUALITIES.length);
        const ratios = await chips.evaluateAll((elements) => {
            type Rgba = [number, number, number, number];
            const parse = (value: string): Rgba => {
                const m = /rgba?\(([^)]+)\)/.exec(value);
                if (m === null) return [0, 0, 0, 0];
                const [r = 0, g = 0, b = 0, a = 1] = m[1]
                    .split(/[\s,/]+/)
                    .filter((p) => p !== '')
                    .map(Number);
                return [r, g, b, a];
            };
            const luminance = (c: Rgba): number => {
                const lin = c.slice(0, 3).map((v) => {
                    const s = v / 255;
                    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
            };
            return elements.map((el) => {
                const layers: Rgba[] = [];
                for (let node: Element | null = el; node !== null; node = node.parentElement) {
                    const style = getComputedStyle(node);
                    // The message paints parchment as an image over its background colour:
                    // stop there and read the parchment's base colour instead.
                    if (style.backgroundImage.startsWith('url(')) break;
                    const layer = parse(style.backgroundColor);
                    if (layer[3] > 0) layers.push(layer);
                    if (layer[3] >= 1) break;
                }
                let surface: Rgba = [235, 225, 205, 1];
                for (const top of layers.reverse()) {
                    const a = top[3];
                    surface = [top[0] * a + surface[0] * (1 - a), top[1] * a + surface[1] * (1 - a), top[2] * a + surface[2] * (1 - a), 1];
                }
                const ink = getComputedStyle(el).color;
                const ls = luminance(surface);
                const lt = luminance(parse(ink));
                return {
                    ratio: (Math.max(ls, lt) + 0.05) / (Math.min(ls, lt) + 0.05),
                    detail: `${ink} on rgb(${surface.slice(0, 3).map(Math.round).join(', ')})`,
                };
            });
        });
        const report = ratios.map((r) => `${r.ratio.toFixed(2)} (${r.detail})`).join('; ');
        await snap(page, 'action-card-quality-chips', { selector: message });
        expect(Math.min(...ratios.map((r) => r.ratio)), `chip contrast ${report}`).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
        recordCoverage('chat.contrast', 'action-roll-chat.quality-chips');
    });
});
