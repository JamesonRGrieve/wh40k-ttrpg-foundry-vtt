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
                    interface DialogInstance {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 render returns Promise<this> with no shipped types
                        render: (opts?: object) => Promise<unknown>;
                        element: HTMLElement | null;
                        // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close returns Promise<this> with no shipped types
                        close: () => Promise<unknown>;
                    }
                    interface DialogModule {
                        default: new (opts?: object) => DialogInstance;
                    }
                    interface DialogHostGlobal {
                        __c9dialog?: DialogInstance | undefined;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import returns `any`; cast to typed dialog module shape
                    const mod = (await import(moduleUrl)) as unknown as DialogModule;
                    const Cls = mod.default;
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
                        await new Promise<void>((r) => {
                            setTimeout(r, 80);
                        });
                    } catch (err) {
                        error = String(err instanceof Error ? err.message : err);
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
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm dialog on globalThis for cross-eval cleanup
                    (globalThis as unknown as DialogHostGlobal).__c9dialog = inst;
                } catch (err) {
                    error = String(err instanceof Error ? err.message : err);
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
            });

            await snap(page, 'warp-travel-dialog');

            // Dialog captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
            await page.evaluate(async () => {
                interface DialogCloseable {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close returns Promise<this> with no shipped types
                    close: () => Promise<unknown>;
                }
                interface DialogHostGlobal {
                    __c9dialog?: DialogCloseable | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading browser-realm dialog stashed on globalThis
                const fg = globalThis as unknown as DialogHostGlobal;
                const d = fg.__c9dialog;
                try {
                    await d?.close();
                } catch {
                    /* ignore */
                }
                fg.__c9dialog = undefined;
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
