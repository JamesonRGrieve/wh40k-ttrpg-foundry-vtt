import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Within-supplement Grenade Throw Dialog (#135).
 *
 * Instantiates the dialog programmatically via its deployed module URL,
 * asserts that the four registry entries surface as picker buttons, and
 * snapshots the rendered DOM as `grenade-throw-dialog`.
 */

test.describe.serial('GrenadeThrowDialog (Tier B)', () => {
    test('renders dialog with the four Within-grenade picker buttons', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/grenade-throw-dialog.js';
                let error: string | null = null;
                let rendered = false;
                const grenadeIds: string[] = [];
                let hasThrowButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (force?: boolean) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return { rendered, grenadeIds, hasThrowButton, error: 'default export not a constructor' };
                    }
                    const inst = new Cls({ grenadeId: 'psychotroke' });
                    try {
                        await inst.render(true);
                        await new Promise((r) => {
                            setTimeout(r, 60);
                        });
                    } catch (err) {
                        error = err instanceof Error ? err.stack ?? err.message : String(err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        for (const btn of Array.from(inst.element.querySelectorAll<HTMLElement>('[data-grenade-id]'))) {
                            const id = btn.dataset.grenadeId;
                            if (typeof id === 'string' && id !== '') grenadeIds.push(id);
                        }
                        hasThrowButton = inst.element.querySelector('[data-action="throw"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    (globalThis as any).__c9dialog = inst;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, grenadeIds, hasThrowButton, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'grenade-throw-dialog');

            // Dialog captured; tear it down so it doesn't leak into the next test's DOM.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const d = (globalThis as any).__c9dialog;
                try {
                    await d?.close?.();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__c9dialog = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.grenadeIds.sort(), 'expected all four canonical grenade picker buttons').toEqual(
                ['photonFlash', 'psychotroke', 'smoke', 'tearsOfTheEmperor'].sort(),
            );
            expect(result.hasThrowButton, 'expected throw action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'GrenadeThrowDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
