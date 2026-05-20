import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Medicae Mechadendrite Half-Action dialog
 * (GitHub #104, errata p. 183).
 *
 * Instantiates the dialog via its deployed module URL, asserts that the
 * "Staunch Blood Loss (Half Action)" button and the Cancel button
 * render, and snaps the result with the dialog left open.
 */

test.describe.serial('MedicaeMechadendriteDialog (Tier B)', () => {
    test('renders the staunch + cancel buttons and snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/medicae-mechadendrite-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasStaunchButton = false;
                let hasCancelButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            hasStaunchButton,
                            hasCancelButton,
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
                        hasStaunchButton = el.querySelector('button[data-action="staunchBloodLoss"]') !== null;
                        hasCancelButton = el.querySelector('button[data-action="cancel"]') !== null;
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
                    hasStaunchButton,
                    hasCancelButton,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'medicae-mechadendrite-dialog');

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
            expect(result.hasStaunchButton, 'Staunch Blood Loss button should render').toBe(true);
            expect(result.hasCancelButton, 'Cancel button should render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'MedicaeMechadendriteDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
