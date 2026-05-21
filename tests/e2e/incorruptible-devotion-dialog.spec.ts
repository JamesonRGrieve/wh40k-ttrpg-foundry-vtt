import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Adepta Sororitas Incorruptible Devotion
 * trade dialog (GitHub #92).
 *
 * Constructs the dialog directly via its deployed module URL with a
 * corruptionAmount of 3, then asserts:
 *   1. The dialog renders into a real HTMLElement.
 *   2. Trade + Decline action buttons are present.
 *   3. The incoming Corruption amount (3) appears in the body.
 *   4. The active dialog is captured as a readable screenshot.
 */

test.describe.serial('IncorruptibleDevotionDialog (Tier B)', () => {
    test('opens with a Corruption amount and renders both choices', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            interface ProbeResult {
                rendered: boolean;
                hasTradeButton: boolean;
                hasDeclineButton: boolean;
                bodyHasAmount: boolean;
                error: string | null;
            }
            interface DialogInstance {
                render: (force?: boolean) => Promise<void>;
                element: HTMLElement | null;
                close: () => Promise<void>;
            }
            interface DialogCtor {
                new (opts: { corruptionAmount: number }): DialogInstance;
            }
            interface DialogModule {
                default: DialogCtor;
            }
            const result = await page.evaluate(async (): Promise<ProbeResult> => {
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/incorruptible-devotion-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasTradeButton = false;
                let hasDeclineButton = false;
                let bodyHasAmount = false;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of compiled JS module; shape declared via DialogModule
                    const mod = (await import(moduleUrl)) as unknown as DialogModule;
                    const Cls = mod.default;
                    if (typeof Cls !== 'function') {
                        return { rendered, hasTradeButton, hasDeclineButton, bodyHasAmount, error: 'default export not a constructor' };
                    }
                    const inst = new Cls({ corruptionAmount: 3 });
                    try {
                        await inst.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 60);
                        });
                    } catch (err) {
                        error = String((err as Error).message);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element !== null) {
                        hasTradeButton = inst.element.querySelector('[data-action="trade"]') !== null;
                        hasDeclineButton = inst.element.querySelector('[data-action="decline"]') !== null;
                        bodyHasAmount = inst.element.textContent.includes('3');
                    }
                } catch (err) {
                    error = String((err as Error).message);
                }

                return { rendered, hasTradeButton, hasDeclineButton, bodyHasAmount, error };
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.hasTradeButton, 'expected Trade action button').toBe(true);
            expect(result.hasDeclineButton, 'expected Decline action button').toBe(true);
            expect(result.bodyHasAmount, 'expected corruption amount (3) in body text').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            await snap(page, 'incorruptible-devotion-dialog');

            recordCoverage('dialog.render', 'IncorruptibleDevotionDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
