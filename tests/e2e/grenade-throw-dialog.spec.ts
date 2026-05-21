import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Within-supplement Grenade Throw Dialog (#135).
 *
 * Instantiates the dialog programmatically via its deployed module URL,
 * asserts that the four registry entries surface as picker buttons, and
 * snapshots the rendered DOM as `grenade-throw-dialog`.
 */

test.describe.serial('GrenadeThrowDialog (Tier B)', () => {
    test('renders dialog with the four Within-grenade picker buttons', async ({ page }) => {
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
                grenadeIds: string[];
                hasThrowButton: boolean;
                error: string | null;
            }
            const result = await page.evaluate(async (): Promise<ProbeResult> => {
                interface DialogInstance {
                    render: (force?: boolean) => Promise<void>;
                    element: HTMLElement | null;
                    close: () => Promise<void>;
                }
                interface DialogCtor {
                    new (opts?: { grenadeId?: string }): DialogInstance;
                }
                interface DialogModule {
                    default: DialogCtor;
                }
                interface DialogGlobal {
                    __c9dialog?: DialogInstance;
                }
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/grenade-throw-dialog.js';
                let error: string | null = null;
                let rendered = false;
                const grenadeIds: string[] = [];
                let hasThrowButton = false;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import of compiled JS module; shape declared via DialogModule
                    const mod = (await import(moduleUrl)) as unknown as DialogModule;
                    const Cls = mod.default;
                    if (typeof Cls !== 'function') {
                        return { rendered, grenadeIds, hasThrowButton, error: 'default export not a constructor' };
                    }
                    const inst = new Cls({ grenadeId: 'psychotroke' });
                    try {
                        await inst.render(true);
                        await new Promise<void>((r) => {
                            setTimeout(r, 60);
                        });
                    } catch (err) {
                        error = err instanceof Error ? err.stack ?? err.message : String(err);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element !== null) {
                        for (const btn of Array.from(inst.element.querySelectorAll<HTMLElement>('[data-grenade-id]'))) {
                            const id = btn.dataset.grenadeId;
                            if (typeof id === 'string' && id !== '') grenadeIds.push(id);
                        }
                        hasThrowButton = inst.element.querySelector('[data-action="throw"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing instance on globalThis for cross-evaluate access
                    (globalThis as unknown as DialogGlobal).__c9dialog = inst;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return { rendered, grenadeIds, hasThrowButton, error };
            });

            await snap(page, 'grenade-throw-dialog');

            // Dialog captured; tear it down so it doesn't leak into the next test's DOM.
            await page.evaluate(async (): Promise<void> => {
                interface DialogInstance {
                    close?: () => Promise<void>;
                }
                interface DialogGlobal {
                    __c9dialog?: DialogInstance;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading stashed instance from globalThis
                const gRef = globalThis as unknown as DialogGlobal;
                const d = gRef.__c9dialog;
                try {
                    await d?.close?.();
                } catch {
                    /* ignore */
                }
                gRef.__c9dialog = undefined;
            });

            expect(result.error, `dialog probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'dialog did not render').toBe(true);
            expect(result.grenadeIds.sort(), 'expected all four canonical grenade picker buttons').toEqual(
                ['photonFlash', 'psychotroke', 'smoke', 'tearsOfTheEmperor'].sort(),
            );
            expect(result.hasThrowButton, 'expected throw action button').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'GrenadeThrowDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
