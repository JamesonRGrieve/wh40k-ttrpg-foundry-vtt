import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #59 — Extended Test toggle on the unified roll dialog.
 *
 * Acolyte-style Extended Tests accumulate DoS toward a threshold over
 * repeated attempts. The dialog surface is a checkbox + threshold input
 * on the modifiers panel. This test opens the dialog, flips the toggle,
 * verifies the threshold field appears, then captures a screenshot.
 *
 * Pattern adapted from `assistance-stepper.spec.ts`.
 */

test.describe.serial('extended test toggle (#59)', () => {
    test('toggle reveals threshold input and persists state across renders', async ({ page }) => {
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

            class SimpleRollData {
                name = 'probe-skill';
                baseTarget = 30;
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
                name: 'probe-skill',
                rollData: new SimpleRollData(),
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

            await new Promise<void>((r) => {
                setTimeout(r, 80);
            });
            const root = dialog.element;
            if (!(root instanceof HTMLElement)) {
                return { error: 'dialog.element is not an HTMLElement', snaps: null };
            }

            function readState(label: string): Record<string, unknown> {
                const wrapper = root!.querySelector<HTMLElement>('.wh40k-extended-test-controls');
                const checkbox = root!.querySelector<HTMLInputElement>('.wh40k-extended-test-controls__checkbox');
                const thresholdInput = root!.querySelector<HTMLInputElement>('.wh40k-extended-test-controls__threshold-input');
                return {
                    label,
                    rendered: wrapper !== null,
                    checked: checkbox?.checked ?? null,
                    thresholdVisible: thresholdInput !== null,
                    thresholdValue: thresholdInput?.value ?? null,
                };
            }

            async function clickCheckbox(): Promise<void> {
                const cb = root!.querySelector<HTMLInputElement>('.wh40k-extended-test-controls__checkbox');
                cb?.click();
                await new Promise<void>((r) => {
                    setTimeout(r, 60);
                });
            }

            const initial = readState('initial-off');
            await clickCheckbox();
            const afterToggleOn = readState('after-toggle-on');
            await clickCheckbox();
            const afterToggleOff = readState('after-toggle-off');

            return { error: null, snaps: { initial, afterToggleOn, afterToggleOff } };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const snaps = result.snaps;
        expect(snaps, 'snapshot bundle returned').not.toBeNull();
        if (snaps === null) return;

        // Initial: wrapper rendered, checkbox unchecked, threshold field hidden.
        expect(snaps.initial.rendered, 'extended-test wrapper renders').toBe(true);
        expect(snaps.initial.checked).toBe(false);
        expect(snaps.initial.thresholdVisible).toBe(false);

        // After toggle on: checkbox checked, threshold field visible with default 5.
        expect(snaps.afterToggleOn.checked).toBe(true);
        expect(snaps.afterToggleOn.thresholdVisible).toBe(true);
        expect(snaps.afterToggleOn.thresholdValue).toBe('5');

        // After toggle off: threshold hidden again.
        expect(snaps.afterToggleOff.checked).toBe(false);
        expect(snaps.afterToggleOff.thresholdVisible).toBe(false);

        // Visual record with the toggle on.
        await page.evaluate(async () => {
            const root = document.querySelector<HTMLElement>('.application[data-application-part]');
            const cb = root?.querySelector<HTMLInputElement>('.wh40k-extended-test-controls__checkbox');
            if (cb !== null && cb !== undefined && !cb.checked) {
                cb.click();
                await new Promise<void>((r) => {
                    setTimeout(r, 60);
                });
            }
        });
        await snap(page, 'extended-test-toggle-on');
    });
});
