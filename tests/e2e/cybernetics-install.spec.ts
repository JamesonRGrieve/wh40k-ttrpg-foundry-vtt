import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Cybernetics Install Dialog (GitHub #125).
 *
 * Instantiates the dialog via its deployed module URL, asserts that
 * the four craftsmanship buttons, four install-site buttons, the
 * difficulty selector, the numeric inputs and the roll button all
 * render, and snaps the result.
 */

test.describe.serial('CyberneticsInstallDialog (Tier B)', () => {
    test('renders craftsmanship + site selectors and snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/cybernetics-install-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let craftButtons = 0;
                let siteButtons = 0;
                let hasDifficulty = false;
                let hasSkillInput = false;
                let hasRollButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            craftButtons,
                            siteButtons,
                            hasDifficulty,
                            hasSkillInput,
                            hasRollButton,
                            error: 'default export not a constructor',
                        };
                    }
                    const inst = new Cls({ deviceName: 'Bionic Arm' });
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
                        craftButtons = el.querySelectorAll('button[data-action="selectCraftsmanship"]').length;
                        siteButtons = el.querySelectorAll('button[data-action="selectSite"]').length;
                        hasDifficulty = el.querySelector('select[name="baseDifficulty"]') !== null;
                        hasSkillInput = el.querySelector('input[name="surgeonSkillTotal"]') !== null;
                        hasRollButton = el.querySelector('button[data-action="rollInstall"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    (globalThis as any).__c9dialog = inst;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    craftButtons,
                    siteButtons,
                    hasDifficulty,
                    hasSkillInput,
                    hasRollButton,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'cybernetics-install-dialog');

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
            expect(result.craftButtons, 'expected four craftsmanship buttons').toBe(4);
            expect(result.siteButtons, 'expected four install-site buttons').toBe(4);
            expect(result.hasDifficulty, 'difficulty selector should render').toBe(true);
            expect(result.hasSkillInput, 'surgeon skill input should render').toBe(true);
            expect(result.hasRollButton, 'Roll Install button should render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'CyberneticsInstallDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
