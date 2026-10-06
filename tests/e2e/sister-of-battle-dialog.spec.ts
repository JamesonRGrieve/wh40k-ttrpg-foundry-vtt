import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Sister of Battle Elite Advance Dialog
 * (GitHub #134).
 *
 * Constructs the dialog directly via its deployed module URL — no
 * actor or item is required for the surface, since the grant rows are
 * read from the Sister of Battle elite advance compendium document.
 *
 * The spec asserts:
 *   1. The dialog renders into a real HTMLElement.
 *   2. The advance document's grant rows (`[data-talent]`) are present.
 *   3. An "Apply" action button (`[data-action="apply"]`) is present.
 *   4. A "Cancel" action button (`[data-action="cancel"]`) is present.
 *
 * Also snaps the dialog at default readable size for visual review.
 */

test.describe.serial('SisterOfBattleDialog (Tier B)', () => {
    test('opens and renders the advance grants plus Apply / Cancel', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/sister-of-battle-dialog.js';
            let error: string | null = null;
            let rendered = false;
            let talentRowCount = 0;
            let hasApplyButton = false;
            let hasCancelButton = false;

            interface DialogModule {
                openSisterOfBattleDialog: () => void;
            }

            try {
                const mod = (await import(moduleUrl)) as DialogModule;
                const inst = await wh40kOpenDialog('sister-of-battle-dialog', () => {
                    mod.openSisterOfBattleDialog();
                });
                // Wait for the dialog content (the checks below report a miss).
                await globalThis.wh40kE2E.pollUntil(() => inst.element?.querySelector('[data-action="apply"]') != null);
                rendered = inst.element instanceof HTMLElement;
                if (rendered && inst.element) {
                    talentRowCount = inst.element.querySelectorAll('[data-talent]').length;
                    hasApplyButton = inst.element.querySelector('[data-action="apply"]') !== null;
                    hasCancelButton = inst.element.querySelector('[data-action="cancel"]') !== null;
                }
            } catch (err) {
                error = err instanceof Error ? err.message : String(err);
            }

            return { rendered, talentRowCount, hasApplyButton, hasCancelButton, error };
        });

        expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'dialog did not render').toBe(true);
        expect(result.talentRowCount, 'expected the advance document grant rows').toBeGreaterThan(0);
        expect(result.hasApplyButton, 'expected Apply action button').toBe(true);
        expect(result.hasCancelButton, 'expected Cancel action button').toBe(true);

        await snap(page, 'sister-of-battle-dialog');

        recordCoverage('dialog.render', 'SisterOfBattleDialog');

        // Best-effort cleanup so the dialog doesn't leak into later specs.
        await page.evaluate(() => {
            const root = document.querySelector<HTMLDialogElement>('.sister-of-battle-dialog');
            if (root?.close) {
                try {
                    root.close();
                } catch {
                    /* ignore */
                }
            }
        });
    });
});
