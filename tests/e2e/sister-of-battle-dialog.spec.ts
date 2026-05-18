import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Sister of Battle Elite Advance Dialog
 * (GitHub #134).
 *
 * Constructs the dialog directly via its deployed module URL — no
 * actor or item is required for the surface, since the talent list
 * comes from `SISTER_OF_BATTLE_TALENTS` in
 * `src/module/rules/sister-of-battle.ts`.
 *
 * The spec asserts:
 *   1. The dialog renders into a real HTMLElement.
 *   2. Three talent grant rows (`[data-talent]`) are present.
 *   3. An "Apply" action button (`[data-action="apply"]`) is present.
 *   4. A "Cancel" action button (`[data-action="cancel"]`) is present.
 *
 * Also snaps the dialog at default readable size for visual review.
 */

test.describe.serial('SisterOfBattleDialog (Tier B)', () => {
    test('opens and renders three talent grants plus Apply / Cancel', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/sister-of-battle-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let talentRowCount = 0;
                let hasApplyButton = false;
                let hasCancelButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as { new (): { render: (force?: boolean) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> } };
                    if (typeof Cls !== 'function') {
                        return { rendered, talentRowCount, hasApplyButton, hasCancelButton, error: 'default export not a constructor' };
                    }
                    const inst = new Cls();
                    try {
                        await inst.render(true);
                        await new Promise((r) => setTimeout(r, 40));
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        talentRowCount = inst.element.querySelectorAll('[data-talent]').length;
                        hasApplyButton = inst.element.querySelector('[data-action="apply"]') !== null;
                        hasCancelButton = inst.element.querySelector('[data-action="cancel"]') !== null;
                    }
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return { rendered, talentRowCount, hasApplyButton, hasCancelButton, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.talentRowCount, 'expected 3 talent rows').toBe(3);
            expect(result.hasApplyButton, 'expected Apply action button').toBe(true);
            expect(result.hasCancelButton, 'expected Cancel action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            await snap(page, 'sister-of-battle-dialog');

            recordCoverage('dialog.render', 'SisterOfBattleDialog');

            // Best-effort cleanup so the dialog doesn't leak into later specs.
            await page.evaluate(() => {
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const root = document.querySelector('.sister-of-battle-dialog') as any;
                if (root?.close) {
                    try {
                        root.close();
                    } catch {
                        /* ignore */
                    }
                }
            });
        } finally {
            page.off('pageerror', listener);
        }
    });
});
