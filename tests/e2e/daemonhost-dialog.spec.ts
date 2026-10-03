import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
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
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/daemonhost-binding-dialog.js';
            let error: string | null = null;
            let rendered = false;
            let tierCardCount = 0;
            let hasBindButton = false;

            try {
                interface DialogModule {
                    openDaemonhostBindingDialog: () => void;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import returns `any`; cast to typed dialog module shape
                const mod = (await import(moduleUrl)) as unknown as DialogModule;
                const inst = await wh40kOpenDialog('daemonhost-binding-dialog', () => {
                    mod.openDaemonhostBindingDialog();
                });
                // Wait for the dialog content (the checks below report a miss).
                await globalThis.wh40kE2E.pollUntil(() => inst.element?.querySelector('[data-action="bind"]') != null);
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
                error = String((err as Error).message);
            }

            return { rendered, tierCardCount, hasBindButton, error };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'dialog did not render').toBe(true);
        expect(result.tierCardCount, 'expected 5 tier cards').toBe(5);
        expect(result.hasBindButton, 'expected Bind action button').toBe(true);

        recordCoverage('dialog.render', 'DaemonhostBindingDialog');
    });
});
