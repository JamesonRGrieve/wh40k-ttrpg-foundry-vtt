import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Mutation Roll Dialog (GitHub #117).
 *
 * Opens the dialog programmatically via its deployed module URL,
 * snapshots the rendered DOM as `mutation-roll-dialog`, and asserts
 * the GM-facing controls are wired (track selectors + roll button).
 */

test.describe.serial('MutationRollDialog (Tier B)', () => {
    test('renders dialog with track selectors and snaps mutation-roll-dialog', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/mutation-roll-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let hasMinorBtn = false;
                let hasMajorBtn = false;
                let hasRollBtn = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (force?: boolean) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return { rendered, hasMinorBtn, hasMajorBtn, hasRollBtn, error: 'default export not a constructor' };
                    }
                    const inst = new Cls({ track: 'major' });
                    try {
                        await inst.render(true);
                        await new Promise((r) => {
                            setTimeout(r, 60);
                        });
                    } catch (err) {
                        error = (err as Error).message;
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        hasMinorBtn = inst.element.querySelector('[data-action="selectTrack"][data-track="minor"]') !== null;
                        hasMajorBtn = inst.element.querySelector('[data-action="selectTrack"][data-track="major"]') !== null;
                        hasRollBtn = inst.element.querySelector('[data-action="rollMutation"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    (globalThis as any).__c9dialog = inst;
                } catch (err) {
                    error = (err as Error).message;
                }

                return { rendered, hasMinorBtn, hasMajorBtn, hasRollBtn, error };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'mutation-roll-dialog');

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
            expect(result.hasMinorBtn, 'expected minor track button').toBe(true);
            expect(result.hasMajorBtn, 'expected major track button').toBe(true);
            expect(result.hasRollBtn, 'expected rollMutation action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'MutationRollDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
