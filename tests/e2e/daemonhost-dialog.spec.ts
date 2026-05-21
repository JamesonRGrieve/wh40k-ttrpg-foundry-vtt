import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Daemonhost Binding Dialog (GitHub #85).
 *
 * Constructs the dialog directly via its deployed module URL — no
 * actor or item is required for the surface, since the tier table
 * comes from `DAEMONHOST_TIERS` in `src/module/rules/daemonhost.ts`.
 *
 * The spec asserts:
 *   1. The dialog renders into a real HTMLElement.
 *   2. Five tier cards (`[data-action="selectTier"]`) are present.
 *   3. A "Bind" action button (`[data-action="bind"]`) is present.
 */

test.describe.serial('DaemonhostBindingDialog (Tier B)', () => {
    test('opens and renders five tier cards plus a Bind action', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/daemonhost-binding-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let tierCardCount = 0;
                let hasBindButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (): { render: (force?: boolean) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return { rendered, tierCardCount, hasBindButton, error: 'default export not a constructor' };
                    }
                    const inst = new Cls();
                    try {
                        await inst.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 40);
                        });
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        tierCardCount = inst.element.querySelectorAll('[data-action="selectTier"]').length;
                        hasBindButton = inst.element.querySelector('[data-action="bind"]') !== null;
                    }
                    try {
                        await inst.close();
                    } catch {
                        /* ignore */
                    }
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return { rendered, tierCardCount, hasBindButton, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.tierCardCount, 'expected 5 tier cards').toBe(5);
            expect(result.hasBindButton, 'expected Bind action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'DaemonhostBindingDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
