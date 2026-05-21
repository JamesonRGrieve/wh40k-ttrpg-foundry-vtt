import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #60 — Assistance stepper on the unified roll dialog.
 *
 * +10 per assistant up to DEFAULT_ASSISTANT_CAP (core.md §"Assistance", p. 25).
 * Opens UnifiedRollDialog against a synthetic simple-skill rollData, clicks
 * the `incrementAssistant` button twice, and asserts that:
 *
 *   - the count badge shows "2"
 *   - the `+N` pill shows "+20"
 *   - the plus button is disabled at cap
 *   - capture both a default `snap` (sheet bounds) and a focused element
 *     screenshot of `.wh40k-assistance-stepper` for review.
 *
 * Pattern adapted from `psychic-push-selector.spec.ts` — instantiate the
 * dialog via its deployed module URL with a hand-rolled rollData.
 */

test.describe.serial('assistance stepper (#60)', () => {
    test('increment + decrement update count, bonus, and cap state', async ({ page }) => {
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

            // Synthetic SimpleSkillRollData-shaped rollData. The dialog only
            // exercises the modifiers panel here, so no skill/weapon plumbing
            // is needed beyond the few fields the partial reads.
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
            // Capture into a typed const so closures below don't need `!`.
            const safeRoot: HTMLElement = root;

            function readState(label: string): Record<string, unknown> {
                const stepperEl = safeRoot.querySelector<HTMLElement>('.wh40k-assistance-stepper');
                const count = safeRoot.querySelector<HTMLElement>('.wh40k-assistance-stepper__count');
                const badge = safeRoot.querySelector<HTMLElement>('.wh40k-assistance-stepper__badge');
                const plus = safeRoot.querySelector<HTMLButtonElement>('.wh40k-assistance-stepper__plus');
                const minus = safeRoot.querySelector<HTMLButtonElement>('.wh40k-assistance-stepper__minus');
                return {
                    label,
                    rendered: stepperEl !== null,
                    count: count?.textContent?.trim() ?? null,
                    badge: badge?.textContent?.trim() ?? null,
                    plusDisabled: plus?.disabled ?? null,
                    minusDisabled: minus?.disabled ?? null,
                };
            }

            async function clickAction(action: string): Promise<void> {
                const el = safeRoot.querySelector<HTMLElement>(`[data-action="${action}"]:not([disabled])`);
                el?.click();
                await new Promise<void>((r) => {
                    setTimeout(r, 60);
                });
            }

            const initial = readState('initial-0');
            await clickAction('incrementAssistant');
            const afterOne = readState('after-+1');
            await clickAction('incrementAssistant');
            const afterTwo = readState('after-+2-capped');
            // Overshoot attempt — button is disabled, so this is a no-op.
            await clickAction('incrementAssistant');
            const afterOvershoot = readState('after-overshoot');
            await clickAction('decrementAssistant');
            const afterDec = readState('after-dec');

            return { error: null, snaps: { initial, afterOne, afterTwo, afterOvershoot, afterDec } };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const snaps = result.snaps;
        expect(snaps, 'snapshot bundle returned').not.toBeNull();
        if (snaps === null) return;

        // Initial: rendered, count=0, badge=+0, minus disabled.
        expect(snaps.initial.rendered, 'stepper renders').toBe(true);
        expect(snaps.initial.count).toBe('0');
        expect(snaps.initial.badge).toBe('+0');
        expect(snaps.initial.minusDisabled).toBe(true);
        expect(snaps.initial.plusDisabled).toBe(false);

        // +1 click: count=1, badge=+10.
        expect(snaps.afterOne.count).toBe('1');
        expect(snaps.afterOne.badge).toBe('+10');
        expect(snaps.afterOne.minusDisabled).toBe(false);
        expect(snaps.afterOne.plusDisabled).toBe(false);

        // +2 click: count=2, badge=+20, plus disabled (cap).
        expect(snaps.afterTwo.count).toBe('2');
        expect(snaps.afterTwo.badge).toBe('+20');
        expect(snaps.afterTwo.plusDisabled).toBe(true);

        // Overshoot stays at cap.
        expect(snaps.afterOvershoot.count).toBe('2');

        // Decrement returns to 1.
        expect(snaps.afterDec.count).toBe('1');
        expect(snaps.afterDec.badge).toBe('+10');

        // Visual record at the cap state.
        await page.evaluate(async () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const root = document.querySelector<HTMLElement>('.application[data-application-part]');
            const plus = root?.querySelector<HTMLButtonElement>('.wh40k-assistance-stepper__plus');
            if (plus && !plus.disabled) {
                plus.click();
                await new Promise<void>((r) => {
                    setTimeout(r, 60);
                });
            }
        });
        await snap(page, 'assistance-stepper-2');

        const stepper = page.locator('.wh40k-assistance-stepper').first();
        if ((await stepper.count()) > 0) {
            const { mkdirSync } = await import('node:fs');
            const { resolve } = await import('node:path');
            const dir = resolve(__dirname, '..', '..', '.e2e-screenshots');
            try {
                mkdirSync(dir, { recursive: true });
            } catch {
                /* ignore */
            }
            await stepper.screenshot({ path: resolve(dir, 'assistance-stepper-element.png') });
        }
    });
});
