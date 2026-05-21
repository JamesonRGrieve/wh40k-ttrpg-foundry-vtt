import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Disorder Roll Dialog (GitHub #116).
 *
 * Instantiates the dialog via its deployed module URL, asserts that
 * each of the three severity buttons (Minor / Severe / Acute) renders,
 * and snaps the result.
 */

test.describe.serial('DisorderRollDialog (Tier B)', () => {
    test('renders all three severity buttons and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/disorder-roll-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let severityButtons = 0;
                let hasMinor = false;
                let hasSevere = false;
                let hasAcute = false;
                let hasRollButton = false;

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
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import returns `any`; cast to typed dialog module shape
                    const mod = (await import(moduleUrl)) as unknown as DialogModule;
                    const Cls = mod.default;
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            severityButtons,
                            hasMinor,
                            hasSevere,
                            hasAcute,
                            hasRollButton,
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
                        error = String((err as Error).message);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const el = inst.element;
                        severityButtons = el.querySelectorAll('button[data-action="selectSeverity"]').length;
                        hasMinor = el.querySelector('button[data-severity="minor"]') !== null;
                        hasSevere = el.querySelector('button[data-severity="severe"]') !== null;
                        hasAcute = el.querySelector('button[data-severity="acute"]') !== null;
                        hasRollButton = el.querySelector('button[data-action="rollDisorder"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    interface DialogHostGlobal {
                        __c9dialog?: DialogInstance | undefined;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm dialog on globalThis for cross-eval cleanup
                    (globalThis as unknown as DialogHostGlobal).__c9dialog = inst;
                } catch (err) {
                    error = String((err as Error).message);
                }

                return {
                    rendered,
                    severityButtons,
                    hasMinor,
                    hasSevere,
                    hasAcute,
                    hasRollButton,
                    error,
                };
            });

            await snap(page, 'disorder-roll-dialog');

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
            expect(result.severityButtons, 'expected three severity buttons').toBe(3);
            expect(result.hasMinor, 'Minor severity button should render').toBe(true);
            expect(result.hasSevere, 'Severe severity button should render').toBe(true);
            expect(result.hasAcute, 'Acute severity button should render').toBe(true);
            expect(result.hasRollButton, 'Roll button should render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'DisorderRollDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
