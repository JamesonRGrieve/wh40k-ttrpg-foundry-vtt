import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Warband Subtlety panel (GitHub #64 / #87).
 *
 * Creates a `dh2-character` with `system.subtlety.value=45`, opens its
 * actor sheet on the Status tab, asserts the panel's value/max readout +
 * GM stepper + breakdown affordance render (the DH2-only gate fired and
 * the partial preloaded), snaps the live sheet, then tears the actor
 * down. Mirrors the structure of `disorder-roll-dialog.spec.ts`: the
 * rendered surface is stashed on a global handle and kept open across the
 * `snap()` call (closing inside the evaluate would leave the screenshot
 * empty), then cleaned up in a second evaluate.
 */

test.describe.serial('SubtletyPanel (Tier B)', () => {
    test('renders the DH2 subtlety pool readout + GM stepper and snaps', async ({ page }) => {
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
                const g = globalThis as any;
                const ActorCls = g.Actor;
                let error: string | null = null;
                let rendered = false;
                let valueText = '';
                let maxText = '';
                let hasStepper = false;
                let stepperButtons = 0;
                let hasBreakdownBtn = false;
                let hasPanel = false;

                if (!ActorCls?.create) {
                    return {
                        rendered,
                        valueText,
                        maxText,
                        hasStepper,
                        stepperButtons,
                        hasBreakdownBtn,
                        hasPanel,
                        error: 'Actor.create unavailable',
                    };
                }

                try {
                    let actor;
                    try {
                        actor = await ActorCls.create({
                            name: 'subtlety-panel-probe',
                            type: 'dh2-character',
                            system: {
                                gameSystem: 'dh2e',
                                subtlety: { value: 45, max: 100 },
                            },
                        });
                    } catch (err) {
                        return {
                            rendered,
                            valueText,
                            maxText,
                            hasStepper,
                            stepperButtons,
                            hasBreakdownBtn,
                            hasPanel,
                            error: String((err as Error)?.message ?? err),
                        };
                    }
                    if (!actor) {
                        return {
                            rendered,
                            valueText,
                            maxText,
                            hasStepper,
                            stepperButtons,
                            hasBreakdownBtn,
                            hasPanel,
                            error: 'Actor.create returned null',
                        };
                    }

                    try {
                        await actor.sheet.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 250);
                        });
                        // Navigate to the Status tab where the panel lives.
                        try {
                            actor.sheet?.changeTab?.('status', 'primary');
                            await new Promise<void>((r) => {
                                setTimeout(r, 150);
                            });
                        } catch {
                            /* sheets without changeTab fall back to the open tab */
                        }
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }

                    const el = actor.sheet?.element ?? null;
                    rendered = el instanceof HTMLElement;
                    if (rendered && el) {
                        hasPanel = el.querySelector('.wh40k-subtlety-panel') !== null;
                        valueText = el.querySelector('.wh40k-subtlety-value')?.textContent?.trim() ?? '';
                        maxText = el.querySelector('.wh40k-subtlety-max')?.textContent?.trim() ?? '';
                        const steppers = el.querySelectorAll('[data-action="adjustSubtletyManually"]');
                        stepperButtons = steppers.length;
                        hasStepper = steppers.length > 0;
                        hasBreakdownBtn = el.querySelector('[data-action="viewSubtletyBreakdown"]') !== null;
                    }
                    // Keep the sheet open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    g.__c9subtlety = actor;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    valueText,
                    maxText,
                    hasStepper,
                    stepperButtons,
                    hasBreakdownBtn,
                    hasPanel,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'subtlety-panel-render');

            // Sheet captured; tear the probe actor down so it doesn't leak
            // into the next serial test's world / DOM.
            await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const g = globalThis as any;
                const a = g.__c9subtlety ?? g.game?.actors?.getName?.('subtlety-panel-probe');
                try {
                    await a?.sheet?.close?.();
                } catch {
                    /* ignore */
                }
                try {
                    await a?.delete?.();
                } catch {
                    /* ignore */
                }
                g.__c9subtlety = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `subtlety panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'actor sheet did not render').toBe(true);
            expect(result.hasPanel, 'DH2 subtlety panel should render (gate / preload regression?)').toBe(true);
            expect(result.valueText, `expected current subtlety '45'; got '${result.valueText}'`).toBe('45');
            expect(result.maxText, `expected max subtlety '100'; got '${result.maxText}'`).toBe('100');
            expect(result.hasStepper, 'GM manual stepper should render for a GM user').toBe(true);
            expect(result.stepperButtons, 'expected the +1 / -1 stepper button pair').toBe(2);
            expect(result.hasBreakdownBtn, 'breakdown affordance should render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'SubtletyPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
