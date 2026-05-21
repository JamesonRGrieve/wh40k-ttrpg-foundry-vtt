import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #139 — Within homeworld trait info dialog.
 *
 * Imports the deployed dialog module, instantiates it, and asserts:
 *   1. Dialog renders into a real HTMLElement.
 *   2. Three homeworld cards (`[data-homeworld]`) are present.
 *   3. The three expected ids appear (`agriWorld`, `feudalWorld`, `frontierWorld`).
 *   4. A "close" action button (`[data-action="close"]`) is present.
 *   5. A screenshot is captured for visual review.
 */

test.describe.serial('WithinHomeworldInfoDialog (#139)', () => {
    test('renders three homeworld cards, all expected ids, and a close action', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/within-homeworld-info-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let cardCount = 0;
                let ids: string[] = [];
                let hasCloseButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (): { render: (force?: boolean) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return { rendered, cardCount, ids, hasCloseButton, error: 'default export not a constructor' };
                    }
                    const inst = new Cls();
                    try {
                        await inst.render(true);
                        await new Promise((r) => {
                            setTimeout(r, 60);
                        });
                    } catch (err) {
                        error = err instanceof Error ? err.message : String(err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const cards = inst.element.querySelectorAll('[data-homeworld]');
                        cardCount = cards.length;
                        ids = Array.from(cards).map((el) => el.getAttribute('data-homeworld') ?? '');
                        hasCloseButton = inst.element.querySelector('[data-action="close"]') !== null;
                    }
                    // intentionally leave open until after screenshot; will close below
                    (window as unknown as { __wh40kWithinHomeworldDialog?: unknown }).__wh40kWithinHomeworldDialog = inst;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, cardCount, ids, hasCloseButton, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.cardCount, 'expected 3 homeworld cards').toBe(3);
            expect(result.ids.sort()).toEqual(['agriWorld', 'feudalWorld', 'frontierWorld']);
            expect(result.hasCloseButton, 'expected close action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            await snap(page, 'within-homeworld-info-dialog');

            // Best-effort teardown — close the still-open dialog instance.
            await page.evaluate(async () => {
                const handle = (window as unknown as { __wh40kWithinHomeworldDialog?: { close: () => Promise<unknown> } }).__wh40kWithinHomeworldDialog;
                try {
                    await handle?.close();
                } catch {
                    /* ignore */
                }
            });

            recordCoverage('dialog.render', 'WithinHomeworldInfoDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
