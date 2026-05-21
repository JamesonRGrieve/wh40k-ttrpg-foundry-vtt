import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Without Homeworld Info Dialog (GitHub #102).
 *
 * Instantiates the dialog via its deployed module URL, asserts that
 * each of the three home-world cards (Death World, Garden World,
 * Research Station) renders along with their respective riders
 * (surprise-bonus suppression, Serenity, Pursuit of Data), and snaps
 * the result. The dialog is kept OPEN through snap() (mirrored from
 * disorder-roll-dialog.spec.ts) so the screenshot captures the live
 * DOM instead of an empty frame.
 */

test.describe.serial('WithoutHomeworldInfoDialog (Tier B)', () => {
    test('renders all three home-world cards and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/without-homeworld-info-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let cardCount = 0;
                let hasDeathWorld = false;
                let hasGardenWorld = false;
                let hasResearchStation = false;
                let hasSurpriseSuppressionRider = false;
                let hasSerenityRider = false;
                let hasPursuitOfDataRider = false;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import returns `any`; cast to typed dialog module shape
                    const mod = (await import(moduleUrl)) as unknown as DialogModule;
                    const Cls = mod.default;
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            cardCount,
                            hasDeathWorld,
                            hasGardenWorld,
                            hasResearchStation,
                            hasSurpriseSuppressionRider,
                            hasSerenityRider,
                            hasPursuitOfDataRider,
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
                        error = err instanceof Error ? err.message : String(err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const el = inst.element;
                        cardCount = el.querySelectorAll('[data-homeworld-id]').length;
                        hasDeathWorld = el.querySelector('[data-homeworld-id="deathWorld"]') !== null;
                        hasGardenWorld = el.querySelector('[data-homeworld-id="gardenWorld"]') !== null;
                        hasResearchStation = el.querySelector('[data-homeworld-id="researchStation"]') !== null;
                        hasSurpriseSuppressionRider = el.querySelector('[data-homeworld-id="deathWorld"] [data-rider="surprise-suppression"]') !== null;
                        hasSerenityRider = el.querySelector('[data-homeworld-id="gardenWorld"] [data-rider="serenity"]') !== null;
                        hasPursuitOfDataRider = el.querySelector('[data-homeworld-id="researchStation"] [data-rider="pursuit-of-data"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm dialog on globalThis for cross-eval cleanup
                    (globalThis as unknown as DialogHostGlobal).__c9dialog = inst;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    cardCount,
                    hasDeathWorld,
                    hasGardenWorld,
                    hasResearchStation,
                    hasSurpriseSuppressionRider,
                    hasSerenityRider,
                    hasPursuitOfDataRider,
                    error,
                };
            });

            await snap(page, 'without-homeworld-info-dialog');

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
            expect(result.cardCount, 'expected three home-world cards').toBe(3);
            expect(result.hasDeathWorld, 'Death World card should render').toBe(true);
            expect(result.hasGardenWorld, 'Garden World card should render').toBe(true);
            expect(result.hasResearchStation, 'Research Station card should render').toBe(true);
            expect(result.hasSurpriseSuppressionRider, 'Death World should surface the surprise-suppression rider').toBe(true);
            expect(result.hasSerenityRider, 'Garden World should surface the Serenity rider').toBe(true);
            expect(result.hasPursuitOfDataRider, 'Research Station should surface the Pursuit-of-Data rider').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'WithoutHomeworldInfoDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
