import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #60 — Assistance on the unified roll dialog.
 *
 * The bare +/- integer stepper was replaced by one toggleable chip per ELIGIBLE
 * ally (friendly token on the active scene, not the roller, trained in the skill
 * being rolled). A raw count let a player claim aid from allies who weren't
 * present or couldn't perform the skill, and gave the chat card no names.
 *
 * What this spec verifies headlessly, against a synthetic rollData with no scene
 * tokens and no skill key:
 *
 *   - the legacy stepper DOM is gone (no `.wh40k-assistance-stepper*`, no
 *     `incrementAssistant` / `decrementAssistant` actions) — a regression guard
 *     on the removal itself;
 *   - with no eligible ally, the chip group is correctly HIDDEN rather than
 *     rendering an empty shell.
 *
 * NOT covered here: chip selection applying +10 each and naming the assistants on
 * the chat card. That needs a scene with friendly tokens whose actors are trained
 * in the rolled skill, which this synthetic harness does not build — the
 * eligibility and cap logic is unit-tested in `src/module/rules/roll-assist.test.ts`.
 * Add a seeded-scene case here when running the licensed lane.
 */

test.describe.serial('assistance chips (#60)', () => {
    test('legacy stepper is gone and the chip group hides when no ally is eligible', async ({ page }) => {
        await joinOrSkip(page);

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
                return { error: 'UnifiedRollDialog default export missing', state: null };
            }

            // Synthetic SimpleSkillRollData-shaped rollData. The dialog only
            // exercises the modifiers panel here, so no skill/weapon plumbing is
            // needed beyond the few fields the partial reads.
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

            let dialog: DialogInstance;
            try {
                dialog = new Cls(actionData);
                await dialog.render(true);
            } catch (err) {
                return { error: `dialog render threw: ${(err as Error).message}`, state: null };
            }

            await new Promise<void>((r) => {
                setTimeout(r, 80);
            });
            const root = dialog.element;
            if (!(root instanceof HTMLElement)) {
                return { error: 'dialog.element is not an HTMLElement', state: null };
            }

            const probe = {
                // Legacy stepper must be fully removed.
                legacyStepper: root.querySelector('.wh40k-assistance-stepper') !== null,
                legacyCount: root.querySelector('.wh40k-assistance-stepper__count') !== null,
                legacyIncrement: root.querySelector('[data-action="incrementAssistant"]') !== null,
                legacyDecrement: root.querySelector('[data-action="decrementAssistant"]') !== null,
                // With no eligible ally the whole group is suppressed.
                chipGroup: root.querySelector('[data-wh40k-hook="assist-chips"]') !== null,
                chips: root.querySelectorAll('[data-wh40k-hook="assist-chip"]').length,
            };

            try {
                await dialog.close?.();
            } catch {
                /* ignore teardown failures */
            }
            return { error: null, state: probe };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const state = result.state;
        expect(state, 'state bundle returned').not.toBeNull();
        if (state === null) return;

        expect(state.legacyStepper, 'legacy .wh40k-assistance-stepper must be gone').toBe(false);
        expect(state.legacyCount, 'legacy count element must be gone').toBe(false);
        expect(state.legacyIncrement, 'incrementAssistant action must be gone').toBe(false);
        expect(state.legacyDecrement, 'decrementAssistant action must be gone').toBe(false);

        expect(state.chipGroup, 'chip group hides when no ally is eligible').toBe(false);
        expect(state.chips, 'no chips render without eligible allies').toBe(0);

        await snap(page, 'assistance-chips-no-eligible-allies');
    });
});
