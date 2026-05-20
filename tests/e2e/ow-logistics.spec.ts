import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the OW Logistics Test dialog (#154).
 *
 * Instantiates the dialog via its deployed module URL, asserts that the
 * four Table 6-2 axis pickers (troop count, time in front, front
 * activity, war condition), the craftsmanship picker, the standard-kit
 * toggle, the live target preview, and the Roll button render, then
 * snaps the result.
 */

test.describe.serial('LogisticsTestDialog (Tier B)', () => {
    test('renders all four axes + craftsmanship + standard-kit + target preview + roll, snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/logistics-test-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasTroopCount = false;
                let hasTimeInFront = false;
                let hasFrontActive = false;
                let hasWarCondition = false;
                let hasCraftsmanship = false;
                let hasStandardKitToggle = false;
                let hasTargetPreview = false;
                let hasRollButton = false;
                let hasCancelButton = false;
                let troopCountButtons = 0;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            hasTroopCount,
                            hasTimeInFront,
                            hasFrontActive,
                            hasWarCondition,
                            hasCraftsmanship,
                            hasStandardKitToggle,
                            hasTargetPreview,
                            hasRollButton,
                            hasCancelButton,
                            troopCountButtons,
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
                        hasTroopCount = el.querySelector('[data-axis="troopCount"]') !== null;
                        hasTimeInFront = el.querySelector('[data-axis="timeInFront"]') !== null;
                        hasFrontActive = el.querySelector('[data-axis="frontActive"]') !== null;
                        hasWarCondition = el.querySelector('[data-axis="warCondition"]') !== null;
                        hasCraftsmanship = el.querySelector('[data-axis="craftsmanship"]') !== null;
                        hasStandardKitToggle = el.querySelector('button[data-action="owToggleStandardKit"]') !== null;
                        hasTargetPreview = el.querySelector('[data-target-preview]') !== null;
                        hasRollButton = el.querySelector('button[data-action="owRollLogistics"]') !== null;
                        hasCancelButton = el.querySelector('button[data-action="owCancelLogistics"]') !== null;
                        troopCountButtons = el.querySelectorAll('[data-axis="troopCount"] button[data-action="owSetAxis"]').length;
                    }
                    (globalThis as any).__owLogisticsDialog = inst;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasTroopCount,
                    hasTimeInFront,
                    hasFrontActive,
                    hasWarCondition,
                    hasCraftsmanship,
                    hasStandardKitToggle,
                    hasTargetPreview,
                    hasRollButton,
                    hasCancelButton,
                    troopCountButtons,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'ow-logistics-dialog');

            // Tear down so the dialog doesn't leak into the next serial test.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const d = (globalThis as any).__owLogisticsDialog;
                try {
                    await d?.close?.();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__owLogisticsDialog = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.hasTroopCount, 'Troop Count axis should render').toBe(true);
            expect(result.hasTimeInFront, 'Time in Front axis should render').toBe(true);
            expect(result.hasFrontActive, 'Front Activity axis should render').toBe(true);
            expect(result.hasWarCondition, 'War Conditions axis should render').toBe(true);
            expect(result.hasCraftsmanship, 'Craftsmanship axis should render').toBe(true);
            expect(result.hasStandardKitToggle, 'Standard Kit toggle should render').toBe(true);
            expect(result.hasTargetPreview, 'Target preview should render').toBe(true);
            expect(result.hasRollButton, 'Roll button should render').toBe(true);
            expect(result.hasCancelButton, 'Cancel button should render').toBe(true);
            expect(result.troopCountButtons, 'expected four Troop Count buttons').toBe(4);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'LogisticsTestDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
