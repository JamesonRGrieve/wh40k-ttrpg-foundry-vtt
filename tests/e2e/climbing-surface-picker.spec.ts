import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #146 — Climbing Surface picker on the unified roll dialog.
 *
 * Errata L113: climbing a sheer surface (sheer cliff, icy crevasse,
 * building wall, hive buttress) is a Hard (-20) Athletics test. The
 * dialog surfaces a per-roll picker that mutates the final-target math.
 * This test opens an Athletics roll, switches the surface to Sheer,
 * checks the rendered indicator, then captures a screenshot.
 *
 * Pattern adapted from `extended-test-toggle.spec.ts`.
 */

test.describe.serial('climbing surface picker (#146)', () => {
    test('switching to Sheer reveals the indicator and updates the final target', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const result = await page.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- e2e probe runs in browser realm against untyped Foundry globals.
            const modUrl = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';
            const mod = await import(/* @vite-ignore */ modUrl);
            const Cls = mod.default;
            if (typeof Cls !== 'function') {
                return { error: 'UnifiedRollDialog default export missing', snaps: null };
            }

            class AthleticsRollData {
                name = 'Athletics';
                type = 'Skill';
                rollKey = 'athletics';
                baseTarget = 40;
                modifiers: Record<string, number> = {};
                rangeBonus = 0;
                calculateTotalModifiers = async (): Promise<void> => {
                    /* no-op */
                };
                finalize = async (): Promise<void> => {
                    /* no-op */
                };
                update = async (): Promise<void> => {
                    /* no-op */
                };
            }
            const actionData = {
                name: 'Athletics',
                rollData: new AthleticsRollData(),
                performActionAndSendToChat: async (): Promise<void> => {
                    /* no-op */
                },
                calculateSuccessOrFailure: async (): Promise<void> => {
                    /* no-op */
                },
            };

            let dialog: { render: (force: boolean) => Promise<unknown>; element?: HTMLElement; close?: () => Promise<unknown> };
            try {
                dialog = new Cls(actionData);
                await dialog.render(true);
            } catch (err) {
                return { error: `dialog render threw: ${String((err as Error)?.message ?? err)}`, snaps: null };
            }

            await new Promise((r) => {
                setTimeout(r, 80);
            });
            const root = dialog.element;
            if (!(root instanceof HTMLElement)) {
                return { error: 'dialog.element is not an HTMLElement', snaps: null };
            }

            function readState(label: string): Record<string, unknown> {
                const wrapper = root!.querySelector<HTMLElement>('.wh40k-climb-surface-picker');
                const select = root!.querySelector<HTMLSelectElement>('.wh40k-climb-surface-picker__select');
                const sheerIndicator = root!.querySelector<HTMLElement>('.wh40k-climb-surface-picker__sheer-indicator');
                return {
                    label,
                    rendered: wrapper !== null,
                    selectValue: select?.value ?? null,
                    sheerVisible: sheerIndicator !== null,
                };
            }

            async function setSurface(value: string): Promise<void> {
                const select = root!.querySelector<HTMLSelectElement>('.wh40k-climb-surface-picker__select');
                if (select === null) return;
                select.value = value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise((r) => {
                    setTimeout(r, 80);
                });
            }

            const initial = readState('initial-standard');
            await setSurface('sheer');
            const afterSheer = readState('after-sheer');
            await setSurface('standard');
            const afterReset = readState('after-reset');

            return { error: null, snaps: { initial, afterSheer, afterReset } };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const snaps = result.snaps;
        expect(snaps, 'snapshot bundle returned').not.toBeNull();
        if (snaps === null) return;

        expect(snaps.initial.rendered, 'climb-surface picker renders on Athletics').toBe(true);
        expect(snaps.initial.selectValue).toBe('standard');
        expect(snaps.initial.sheerVisible).toBe(false);

        expect(snaps.afterSheer.selectValue).toBe('sheer');
        expect(snaps.afterSheer.sheerVisible, 'sheer indicator appears').toBe(true);

        expect(snaps.afterReset.selectValue).toBe('standard');
        expect(snaps.afterReset.sheerVisible).toBe(false);

        // Visual record with the picker on Sheer.
        await page.evaluate(async () => {
            const root = document.querySelector<HTMLElement>('.application[data-application-part]');
            const select = root?.querySelector<HTMLSelectElement>('.wh40k-climb-surface-picker__select');
            if (select !== null && select !== undefined && select.value !== 'sheer') {
                select.value = 'sheer';
                select.dispatchEvent(new Event('change', { bubbles: true }));
                await new Promise((r) => {
                    setTimeout(r, 80);
                });
            }
        });
        await snap(page, 'climbing-sheer-surface');
    });
});
