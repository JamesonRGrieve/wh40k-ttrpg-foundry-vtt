import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the OW Logistics Test dialog (#154).
 *
 * Instantiates the dialog via its deployed module URL, asserts that the
 * four logistics-table axis pickers (troop count, time in front, front
 * activity, war condition), the craftsmanship picker, the standard-kit
 * toggle, the live target preview, and the Roll button render, then
 * snaps the result.
 */

test.describe.serial('LogisticsTestDialog (Tier B)', () => {
    test('renders all four axes + craftsmanship + standard-kit + target preview + roll, snaps', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            interface DialogInstance {
                render: (opts?: { force: boolean }) => Promise<void>;
                element: HTMLElement | null;
                close: () => Promise<void>;
            }
            interface DialogCtor {
                new (opts?: object): DialogInstance;
            }
            interface DialogModule {
                default: DialogCtor;
            }
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
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of compiled JS module; shape declared via DialogModule
                const mod = (await import(moduleUrl)) as unknown as DialogModule;
                const Cls = mod.default;
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
                    // Wait for the dialog's axes to render (the checks below report a miss).
                    await globalThis.wh40kE2E.pollUntil(() => inst.element?.querySelector('[data-axis="troopCount"]') != null);
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
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
                // eslint-disable-next-line no-restricted-syntax -- boundary: stashing instance on globalThis for cross-evaluate access
                (globalThis as unknown as { __owLogisticsDialog?: DialogInstance }).__owLogisticsDialog = inst;
            } catch (err) {
                error = err instanceof Error ? err.message : String(err);
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
        });

        // #701: the target shows its derivation: each component's row with its source tooltip, their raw sum,
        // the clamp note exactly when the sum is below 0, and a target of max(0, sum).
        const breakdown = page.locator('[data-wh40k-hook="logistics-breakdown"]');
        await expect(breakdown).toBeVisible();
        const componentValues = await breakdown
            .locator('[data-wh40k-tooltip="modifier"] span:last-child')
            .evaluateAll((spans) => spans.map((span) => Number(span.textContent.trim())));
        expect(componentValues.length).toBeGreaterThanOrEqual(6);
        const rawSum = Number(((await breakdown.locator('[data-logistics-row="sum"] span').last().textContent()) ?? '').trim());
        expect(rawSum).toBe(componentValues.reduce((total, value) => total + value, 0));
        await expect(breakdown.locator('[data-logistics-row="clamp"]')).toHaveCount(rawSum < 0 ? 1 : 0);
        await expect(breakdown.locator('[data-logistics-row="target"] span').last()).toHaveText(String(Math.max(0, rawSum)));
        // The capture shows the derivation, not just the picker above it.
        await breakdown.locator('[data-logistics-row="target"]').scrollIntoViewIfNeeded();

        await snap(page, 'ow-logistics-dialog');

        // Tear down so the dialog doesn't leak into the next serial test.
        await page.evaluate(async () => {
            interface DialogHandle {
                close?: () => Promise<void>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: reading instance stashed on globalThis across evaluate calls
            const g = globalThis as unknown as { __owLogisticsDialog?: DialogHandle };
            try {
                await g.__owLogisticsDialog?.close?.();
            } catch {
                /* ignore */
            }
            g.__owLogisticsDialog = undefined;
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
        // The logistics table prints three troop columns: Company or Less, Single Regiment, Multiple Regiments.
        expect(result.troopCountButtons, 'expected three Troop Count buttons').toBe(3);

        recordCoverage('dialog.render', 'LogisticsTestDialog');
    });
});
