import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the RT Acquisition Dialog Scale upgrade (GitHub #192).
 *
 * Instantiates the dialog with an RT actor + item probe and asserts that
 * each of the seven Scale selector buttons (Negligible…Vast) renders,
 * along with the Availability and Craftsmanship selectors and the Roll
 * button. The dialog is left open across `snap()` so the screenshot
 * captures the live DOM, then torn down so the next serial test starts
 * clean (mirrors tests/e2e/disorder-roll-dialog.spec.ts exactly).
 */

test.describe.serial('AcquisitionDialog Scale upgrade (Tier B)', () => {
    test('renders all seven scale buttons + auto-success banner and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(
                async (): Promise<{
                    rendered: boolean;
                    scaleButtons: number;
                    availabilityButtons: number;
                    craftsmanshipButtons: number;
                    hasNegligible: boolean;
                    hasVast: boolean;
                    hasStandard: boolean;
                    hasRollButton: boolean;
                    hasAutoSuccessBanner: boolean;
                    hasAutoFailBanner: boolean;
                    error: string | null;
                }> => {
                    interface ActorStub {
                        system: { rogueTrader: { profitFactor: { current: number; starting: number } }; gameSystem: string };
                        getFlag: () => undefined;
                        setFlag: () => Promise<void>;
                    }
                    interface DialogInstance {
                        render: (opts?: { force: boolean }) => Promise<void>;
                        element: HTMLElement | null;
                        close: (opts?: { _skipResolve: boolean }) => Promise<void>;
                        selectedAvailability?: string;
                        selectedScale?: string;
                        selectedCraftsmanship?: string;
                    }
                    interface DialogModule {
                        default: { new (actor: ActorStub, opts?: object): DialogInstance };
                    }
                    interface FoundryGlobal {
                        __c9dialog?: DialogInstance | undefined;
                    }
                    const moduleUrl = '/systems/wh40k-rpg/module/applications/dialogs/acquisition-dialog.js';
                    let error: string | null = null;
                    let rendered = false;
                    let scaleButtons = 0;
                    let availabilityButtons = 0;
                    let craftsmanshipButtons = 0;
                    let hasNegligible = false;
                    let hasVast = false;
                    let hasStandard = false;
                    let hasRollButton = false;
                    let hasAutoSuccessBanner = false;
                    let hasAutoFailBanner = false;

                    try {
                        const mod = (await import(moduleUrl)) as DialogModule;
                        const Cls = mod.default;
                        if (typeof Cls !== 'function') {
                            return {
                                rendered,
                                scaleButtons,
                                availabilityButtons,
                                craftsmanshipButtons,
                                hasNegligible,
                                hasVast,
                                hasStandard,
                                hasRollButton,
                                hasAutoSuccessBanner,
                                hasAutoFailBanner,
                                error: 'default export not a constructor',
                            };
                        }
                        // Build a minimal RT-shaped actor stub. We avoid creating a
                        // real Foundry actor (which would interact with permission +
                        // world settings) — the dialog only reads .system and
                        // .getFlag.
                        const actorStub: ActorStub = {
                            system: { rogueTrader: { profitFactor: { current: 80, starting: 50 } }, gameSystem: 'rt' },
                            getFlag: () => undefined,
                            setFlag: async () => Promise.resolve(),
                        };

                        const inst = new Cls(actorStub, {});
                        // Force the dialog into a config that triggers the
                        // auto-success banner: 80 PF + ubiquitous (+70) + best (−30)
                        // + negligible (+30) = 150 ⇒ autoSuccess.
                        inst.selectedAvailability = 'ubiquitous';
                        inst.selectedCraftsmanship = 'best';
                        inst.selectedScale = 'negligible';

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
                            scaleButtons = el.querySelectorAll('button[data-action="selectScale"]').length;
                            availabilityButtons = el.querySelectorAll('button[data-action="selectAvailability"]').length;
                            craftsmanshipButtons = el.querySelectorAll('button[data-action="selectCraftsmanship"]').length;
                            hasNegligible = el.querySelector('button[data-scale="negligible"]') !== null;
                            hasVast = el.querySelector('button[data-scale="vast"]') !== null;
                            hasStandard = el.querySelector('button[data-scale="standard"]') !== null;
                            hasRollButton = el.querySelector('button[data-action="roll"]') !== null;
                            hasAutoSuccessBanner = el.querySelector('[data-acq-banner="auto-success"]') !== null;
                            hasAutoFailBanner = el.querySelector('[data-acq-banner="auto-fail"]') !== null;
                        }
                        // Keep the dialog open and on a handle so snap() (called
                        // outside this evaluate) captures the live DOM. Closing
                        // here would leave the screenshot empty.
                        // eslint-disable-next-line no-restricted-syntax -- boundary: custom probe handle on globalThis has no shipped types in this browser-side probe
                        (globalThis as unknown as FoundryGlobal).__c9dialog = inst;
                    } catch (err) {
                        error = err instanceof Error ? err.message : String(err);
                    }

                    return {
                        rendered,
                        scaleButtons,
                        availabilityButtons,
                        craftsmanshipButtons,
                        hasNegligible,
                        hasVast,
                        hasStandard,
                        hasRollButton,
                        hasAutoSuccessBanner,
                        hasAutoFailBanner,
                        error,
                    };
                },
            );

            const snapPath = await snap(page, 'acquisition-scale-dialog');

            // Dialog captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
            await page.evaluate(async (): Promise<void> => {
                interface FoundryGlobal {
                    __c9dialog?: { close?: (opts?: { _skipResolve: boolean }) => Promise<void> } | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: custom probe handle on globalThis has no shipped types in this browser-side cleanup
                const g = globalThis as unknown as FoundryGlobal;
                const d = g.__c9dialog;
                try {
                    await d?.close?.({ _skipResolve: true });
                } catch {
                    /* ignore */
                }
                g.__c9dialog = undefined;
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.scaleButtons, 'expected seven Scale buttons').toBe(7);
            expect(result.availabilityButtons, 'expected eleven Availability buttons').toBe(11);
            expect(result.craftsmanshipButtons, 'expected four Craftsmanship buttons').toBe(4);
            expect(result.hasNegligible, 'Negligible scale should render').toBe(true);
            expect(result.hasVast, 'Vast scale should render').toBe(true);
            expect(result.hasStandard, 'Standard scale should render').toBe(true);
            expect(result.hasRollButton, 'Roll button should render').toBe(true);
            expect(result.hasAutoSuccessBanner, 'auto-success banner should appear at PF≥100').toBe(true);
            expect(result.hasAutoFailBanner, 'auto-fail banner should NOT appear when autoSuccess fires').toBe(false);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            // Verify the screenshot file is non-empty so we know snap()
            // produced a real PNG rather than silently swallowing an error.
            if (snapPath !== null) {
                // Node fs is available in the spec runner (not the browser
                // page). Use dynamic import to avoid a top-level Node import
                // in a Playwright spec.
                const { statSync } = await import('node:fs');
                const sz = statSync(snapPath).size;
                expect(sz, `screenshot ${snapPath} should be non-empty`).toBeGreaterThan(0);
            }

            recordCoverage('dialog.render', 'AcquisitionDialog-Scale');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
