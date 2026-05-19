import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Warp Travel Dialog (GitHub #193).
 *
 * Instantiates the dialog via its deployed module URL, asserts that
 * the four primary action buttons (Resolve / Post Chat / Roll Peril /
 * Cancel) render and that all seven required input fields exist, then
 * snaps the dialog.
 */

test.describe.serial('WarpTravelDialog (Tier B)', () => {
    test('renders 5-stage inputs and action buttons, then snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/warp-travel-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasResolve = false;
                let hasPostChat = false;
                let hasRollPeril = false;
                let hasCancel = false;
                let inputCount = 0;
                let hasBaseDays = false;
                let hasNavigationWarp = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            hasResolve,
                            hasPostChat,
                            hasRollPeril,
                            hasCancel,
                            inputCount,
                            hasBaseDays,
                            hasNavigationWarp,
                            error: 'default export not a constructor',
                        };
                    }
                    const inst = new Cls({});
                    try {
                        await inst.render({ force: true });
                        await new Promise((r) => setTimeout(r, 80));
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const el = inst.element;
                        hasResolve = el.querySelector('button[data-action="resolveJourney"]') !== null;
                        hasPostChat = el.querySelector('button[data-action="postChat"]') !== null;
                        hasRollPeril = el.querySelector('button[data-action="rollPeril"]') !== null;
                        hasCancel = el.querySelector('button[data-action="cancel"]') !== null;
                        inputCount = el.querySelectorAll('input[type="number"]').length;
                        hasBaseDays = el.querySelector('input[name="baseDays"]') !== null;
                        hasNavigationWarp = el.querySelector('input[name="navigationWarp"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    (globalThis as any).__c9dialog = inst;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasResolve,
                    hasPostChat,
                    hasRollPeril,
                    hasCancel,
                    inputCount,
                    hasBaseDays,
                    hasNavigationWarp,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'warp-travel-dialog');

            // Dialog captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
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
            expect(result.hasResolve, 'Resolve button should render').toBe(true);
            expect(result.hasPostChat, 'Post Chat button should render').toBe(true);
            expect(result.hasRollPeril, 'Roll Peril button should render').toBe(true);
            expect(result.hasCancel, 'Cancel button should render').toBe(true);
            expect(result.hasBaseDays, 'baseDays input should render').toBe(true);
            expect(result.hasNavigationWarp, 'navigationWarp input should render').toBe(true);
            expect(result.inputCount, 'expected 7 number inputs (3 characteristics + 4 stage rolls)').toBe(7);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'WarpTravelDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
