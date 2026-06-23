import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * e2e coverage of the Psychic Push / Fettered / Unfettered selector added to
 * `UnifiedRollDialog` (#69). Opens the dialog with a synthetic psychic
 * ActionData payload, then clicks each mode and the push-level stepper —
 * asserting on the rendered DOM after each interaction.
 *
 * Pattern lifted from `tests/e2e/dialogs.spec.ts` — instantiate the dialog
 * class via its deployed module URL with a hand-rolled rollData that
 * satisfies the psychic-panel template's field accesses, render(true), then
 * exercise the new data-action handlers.
 */

test.describe.serial('psychic push selector', () => {
    test('renders three-mode selector and updates state across mode + push level changes', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const result = await page.evaluate(async () => {
            interface DialogInstance {
                render: (force: boolean) => Promise<void>;
                element?: HTMLElement;
                close?: () => Promise<void>;
            }
            interface DialogModule {
                default: new (actionData: object) => DialogInstance;
            }
            const modUrl = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';
            const mod = (await import(/* @vite-ignore */ modUrl)) as DialogModule;
            const Cls = mod.default;
            if (typeof Cls !== 'function') {
                return { error: 'UnifiedRollDialog default export missing' };
            }

            // Synthetic ActionData with a `PsychicRollData`-shaped rollData.
            // The dialog branches on `rollData.constructor.name === 'PsychicRollData'`,
            // so we shim a custom class for that exact identity.
            class PsychicRollData {
                name = 'probe-power';
                baseTarget = 30;
                modifiers: Record<string, number> = {};
                difficulties = { '-30': 'Hard (-30)', '0': 'Routine (+0)', '30': 'Easy (+30)' };
                power = { id: 'p1', name: 'Force Bolt', img: 'icons/svg/explosion.svg' };
                psychicPowers = [];
                pr = 4;
                maxPr = 6;
                hasFocus = true;
                distance = 10;
                rangeName = 'Standard';
                maxRange = 30;
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
                name: 'probe-power',
                rollData: new PsychicRollData(),
                performActionAndSendToChat: async (): Promise<void> => {
                    /* no-op */
                },
            };

            let dialog: DialogInstance;
            try {
                dialog = new Cls(actionData);
                await dialog.render(true);
            } catch (err) {
                return { error: `dialog render threw: ${(err as Error).message}` };
            }

            // Allow ApplicationV2 to flush its render frame.
            await new Promise((r) => {
                setTimeout(r, 50);
            });

            const root = dialog.element;
            if (!(root instanceof HTMLElement)) {
                return { error: 'dialog.element is not an HTMLElement' };
            }

            interface PsySnap {
                label: string;
                selector: boolean;
                fetteredActive: boolean;
                unfetteredActive: boolean;
                pushActive: boolean;
                stepperVisible: boolean;
                pushLevel: string | null;
                effectivePR: string | null;
                focusMod: string | null;
                forcePhenomena: boolean;
            }
            function snap(el: HTMLElement, label: string): PsySnap {
                const fett = el.querySelector<HTMLButtonElement>('[data-testid="psy-mode-fettered"]');
                const unfett = el.querySelector<HTMLButtonElement>('[data-testid="psy-mode-unfettered"]');
                const push = el.querySelector<HTMLButtonElement>('[data-testid="psy-mode-push"]');
                const stepper = el.querySelector<HTMLElement>('[data-testid="psy-push-stepper"]');
                const level = el.querySelector<HTMLElement>('[data-testid="psy-push-level-value"]');
                const effPR = el.querySelector<HTMLElement>('[data-testid="psy-effective-pr"]');
                const focusMod = el.querySelector<HTMLElement>('[data-testid="psy-focus-mod"]');
                const phenomena = el.querySelector<HTMLElement>('[data-testid="psy-force-phenomena"]');
                return {
                    label,
                    selector: el.querySelector('[data-testid="psy-mode-selector"]') !== null,
                    fetteredActive: fett?.className.includes('tw-bg-blue-900/40') ?? false,
                    unfetteredActive: unfett?.className.includes('tw-bg-[rgba(201,162,39,0.15)]') ?? false,
                    pushActive: push?.className.includes('tw-bg-red-900/40') ?? false,
                    stepperVisible: stepper !== null,
                    pushLevel: level?.textContent.trim() ?? null,
                    effectivePR: effPR?.textContent.trim() ?? null,
                    focusMod: focusMod?.textContent.trim() ?? null,
                    forcePhenomena: phenomena !== null,
                };
            }

            async function clickAction(el: HTMLElement, action: string): Promise<void> {
                const btn = el.querySelector<HTMLElement>(`[data-action="${action}"]`);
                btn?.click();
                await new Promise((r) => {
                    setTimeout(r, 50);
                });
            }

            // Open the context panel (it starts expanded but render order may
            // collapse it; toggle as a no-op if already open).
            if (!root.querySelector('[data-testid="psy-mode-selector"]')) {
                await clickAction(root, 'toggleContextSection');
            }

            const initial = snap(root, 'initial-unfettered');

            // Switch to Fettered.
            const fetteredBtn = root.querySelector<HTMLElement>('[data-testid="psy-mode-fettered"]');
            fetteredBtn?.click();
            await new Promise((r) => {
                setTimeout(r, 50);
            });
            const fettered = snap(root, 'fettered');

            // Switch to Push, then increment twice (1 -> 2 -> 3), then try to overshoot.
            const pushBtn = root.querySelector<HTMLElement>('[data-testid="psy-mode-push"]');
            pushBtn?.click();
            await new Promise((r) => {
                setTimeout(r, 50);
            });
            const push1 = snap(root, 'push-1');

            // The context panel re-renders (ApplicationV2 partial render) on every
            // push-level change, which DETACHES the stepper buttons — a reference
            // captured once would go stale and subsequent clicks would no-op. Re-query
            // the button from `root` before each click, and poll for the rendered
            // level value to settle rather than racing a fixed delay.
            const clickStep = async (testid: string, expectLevel: string): Promise<void> => {
                root.querySelector<HTMLElement>(`[data-testid="${testid}"]`)?.click();
                for (let i = 0; i < 20; i++) {
                    await new Promise((r) => {
                        setTimeout(r, 25);
                    });
                    if (root.querySelector('[data-testid="psy-push-level-value"]')?.textContent.trim() === expectLevel) break;
                }
            };
            await clickStep('psy-push-increment', '2');
            const push2 = snap(root, 'push-2');
            await clickStep('psy-push-increment', '3');
            const push3 = snap(root, 'push-3');
            await clickStep('psy-push-increment', '3'); // clamps at 3
            const push3Clamped = snap(root, 'push-3-clamped');

            await clickStep('psy-push-decrement', '2');
            const push2Back = snap(root, 'push-2-back');

            try {
                await dialog.close?.();
            } catch {
                /* ignore */
            }

            return { error: null, snaps: { initial, fettered, push1, push2, push3, push3Clamped, push2Back } };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const snaps = result.snaps;
        expect(snaps, 'snapshot bundle returned').toBeDefined();
        if (!snaps) return;

        // Initial: unfettered, no stepper, full PR (4).
        expect(snaps.initial.selector).toBe(true);
        expect(snaps.initial.unfetteredActive).toBe(true);
        expect(snaps.initial.stepperVisible).toBe(false);
        expect(snaps.initial.effectivePR).toBe('4');
        expect(snaps.initial.focusMod).toBe('+0');
        expect(snaps.initial.forcePhenomena).toBe(false);

        // Fettered: half PR (2), +10 focus, no phenomena.
        expect(snaps.fettered.fetteredActive).toBe(true);
        expect(snaps.fettered.unfetteredActive).toBe(false);
        expect(snaps.fettered.stepperVisible).toBe(false);
        expect(snaps.fettered.effectivePR).toBe('2');
        expect(snaps.fettered.focusMod).toBe('+10');
        expect(snaps.fettered.forcePhenomena).toBe(false);

        // Push 1: PR 4+1=5, -10 focus, always phenomena.
        expect(snaps.push1.pushActive).toBe(true);
        expect(snaps.push1.stepperVisible).toBe(true);
        expect(snaps.push1.pushLevel).toBe('1');
        expect(snaps.push1.effectivePR).toBe('5');
        expect(snaps.push1.focusMod).toBe('-10');
        expect(snaps.push1.forcePhenomena).toBe(true);

        // Push 2: PR 4+2=6, -20 focus.
        expect(snaps.push2.pushLevel).toBe('2');
        expect(snaps.push2.effectivePR).toBe('6');
        expect(snaps.push2.focusMod).toBe('-20');

        // Push 3: PR 4+3=7, -30 focus.
        expect(snaps.push3.pushLevel).toBe('3');
        expect(snaps.push3.effectivePR).toBe('7');
        expect(snaps.push3.focusMod).toBe('-30');

        // Clamped at 3 after overshoot attempt.
        expect(snaps.push3Clamped.pushLevel).toBe('3');

        // Decrement back to 2.
        expect(snaps.push2Back.pushLevel).toBe('2');
    });
});
