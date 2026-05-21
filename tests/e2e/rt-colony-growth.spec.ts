import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the RT Colony Growth Dialog (GitHub #195).
 *
 * Instantiates the dialog via its deployed module URL, asserts that
 * each Characteristic row (Size + Complacency + Order + Productivity +
 * Piety), the growth-modifier control, the two type-specific toggles,
 * and the Roll button render, then snaps the result.
 */

test.describe.serial('ColonyGrowthDialog (Tier B)', () => {
    test('renders all five characteristic rows + modifier + roll button and snaps', async ({ page }) => {
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
                const moduleUrl = '/systems/wh40k-rpg/module/applications/prompts/colony-growth-dialog.js';
                let error: string | null = null;
                let rendered = false;
                let statRows = 0;
                let hasSize = false;
                let hasComplacency = false;
                let hasOrder = false;
                let hasProductivity = false;
                let hasPiety = false;
                let hasModifier = false;
                let hasAgriculturalToggle = false;
                let hasEcclesiasticalToggle = false;
                let hasRollButton = false;

                try {
                    const mod = await import(moduleUrl);
                    const Cls = mod.default as {
                        new (opts?: unknown): { render: (opts?: unknown) => Promise<unknown>; element: HTMLElement | null; close: () => Promise<unknown> };
                    };
                    if (typeof Cls !== 'function') {
                        return {
                            rendered,
                            statRows,
                            hasSize,
                            hasComplacency,
                            hasOrder,
                            hasProductivity,
                            hasPiety,
                            hasModifier,
                            hasAgriculturalToggle,
                            hasEcclesiasticalToggle,
                            hasRollButton,
                            error: 'default export not a constructor',
                        };
                    }
                    const inst = new Cls({});
                    try {
                        await inst.render({ force: true });
                        await new Promise<void>((r) => {
                            setTimeout(r, 80);
                        });
                    } catch (err) {
                        error = String((err as Error).message);
                    }
                    rendered = inst.element instanceof HTMLElement;
                    if (rendered && inst.element) {
                        const el = inst.element;
                        statRows = el.querySelectorAll('[data-stat-value]').length;
                        hasSize = el.querySelector('[data-stat-value="size"]') !== null;
                        hasComplacency = el.querySelector('[data-stat-value="complacency"]') !== null;
                        hasOrder = el.querySelector('[data-stat-value="order"]') !== null;
                        hasProductivity = el.querySelector('[data-stat-value="productivity"]') !== null;
                        hasPiety = el.querySelector('[data-stat-value="piety"]') !== null;
                        hasModifier = el.querySelector('[data-modifier-value]') !== null;
                        hasAgriculturalToggle = el.querySelector('button[data-action="toggleAgricultural"]') !== null;
                        hasEcclesiasticalToggle = el.querySelector('button[data-action="toggleEcclesiastical"]') !== null;
                        hasRollButton = el.querySelector('button[data-action="rollGrowth"]') !== null;
                    }
                    // Keep the dialog open and on a handle so snap() (called
                    // outside this evaluate) captures the live DOM. Closing
                    // here would leave the screenshot empty.
                    (globalThis as any).__c9dialog = inst;
                } catch (err) {
                    error = String((err as Error).message);
                }

                return {
                    rendered,
                    statRows,
                    hasSize,
                    hasComplacency,
                    hasOrder,
                    hasProductivity,
                    hasPiety,
                    hasModifier,
                    hasAgriculturalToggle,
                    hasEcclesiasticalToggle,
                    hasRollButton,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'rt-colony-growth-dialog');

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
            expect(result.statRows, 'expected five characteristic rows').toBe(5);
            expect(result.hasSize, 'Size row should render').toBe(true);
            expect(result.hasComplacency, 'Complacency row should render').toBe(true);
            expect(result.hasOrder, 'Order row should render').toBe(true);
            expect(result.hasProductivity, 'Productivity row should render').toBe(true);
            expect(result.hasPiety, 'Piety row should render').toBe(true);
            expect(result.hasModifier, 'Growth-modifier control should render').toBe(true);
            expect(result.hasAgriculturalToggle, 'Agricultural softener toggle should render').toBe(true);
            expect(result.hasEcclesiasticalToggle, 'Ecclesiastical Order-swap toggle should render').toBe(true);
            expect(result.hasRollButton, 'Roll Growth button should render').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('dialog.render', 'ColonyGrowthDialog');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
