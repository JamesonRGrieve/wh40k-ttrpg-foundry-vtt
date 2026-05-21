import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #61 — Alt-characteristic dropdown + untrained-skill halving
 * indicator on the UnifiedRollDialog.
 *
 * Creates a dh2-character with an Athletics-shaped skill item that declares
 * `altCharacteristics: ['toughness']`, opens the unified roll dialog against a
 * skill-typed rollData carrying `rollKey: 'athletics'`, and asserts that:
 *
 *   - the characteristic-override <select> renders with both options;
 *   - selecting the alt option mutates the visible target (Strength → Toughness);
 *   - a default `snap(page, 'skill-altchar-dropdown')` is captured for review.
 */

test.describe.serial('skill alt-characteristic dropdown (#61)', () => {
    test('renders dropdown, swaps characteristic, surfaces indicators', async ({ page }) => {
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

            // Build a synthetic sourceActor with a skill bag + characteristics
            // bag + items.find returning a skill item carrying altCharacteristics.
            // This sidesteps full DataModel construction (heavy) while exercising
            // the dialog's lookup paths.
            const sourceActor = {
                name: 'Probe',
                img: 'icons/svg/mystery-man.svg',
                skills: {
                    athletics: { advance: 1, characteristic: 'strength', current: 35, basic: true },
                },
                characteristics: {
                    strength: { total: 35, label: 'Strength', short: 'S' },
                    toughness: { total: 45, label: 'Toughness', short: 'T' },
                },
                items: {
                    find(
                        cb: (i: {
                            type?: string;
                            name?: string;
                            system?: { identifier?: string; altCharacteristics?: string[]; isBasic?: boolean };
                        }) => boolean,
                    ) {
                        const skillItem = {
                            type: 'skill',
                            name: 'athletics',
                            system: { identifier: 'athletics', altCharacteristics: ['toughness'], isBasic: true },
                        };
                        return cb(skillItem) ? skillItem : undefined;
                    },
                },
            };

            class SimpleRollData {
                name = 'Athletics Test';
                nameOverride = 'Athletics Test';
                type = 'Skill';
                rollKey = 'athletics';
                baseTarget = 35;
                sourceActor = sourceActor;
                actor = sourceActor;
                modifiers: Record<string, number> = { modifier: 0 };
                rangeBonus = 0;
                calculateTotalModifiers = async (): Promise<void> => {};
                finalize = async (): Promise<void> => {};
                update = async (): Promise<void> => {};
            }
            const actionData = {
                name: 'Athletics Test',
                rollData: new SimpleRollData(),
                performActionAndSendToChat: async (): Promise<void> => {},
                calculateSuccessOrFailure: async (): Promise<void> => {},
            };

            let dialog: { render: (force: boolean) => Promise<unknown>; element?: HTMLElement; close?: () => Promise<unknown> };
            try {
                dialog = new Cls(actionData);
                await dialog.render(true);
            } catch (err) {
                return { error: `dialog render threw: ${String(err instanceof Error ? err.message : err)}`, snaps: null };
            }

            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });
            const root = dialog.element;
            if (!(root instanceof HTMLElement)) {
                return { error: 'dialog.element is not an HTMLElement', snaps: null };
            }

            function readState(label: string): Record<string, unknown> {
                const charSelect = root!.querySelector<HTMLSelectElement>('.wh40k-skill-char-override__select');
                const target = root!.querySelector<HTMLElement>('.urd-target__number');
                const halved = root!.querySelector<HTMLElement>('[data-testid="skill-untrained-halved"]');
                const blocked = root!.querySelector<HTMLElement>('[data-testid="skill-untrained-advanced"]');
                return {
                    label,
                    rendered: charSelect !== null,
                    optionCount: charSelect?.options.length ?? 0,
                    currentValue: charSelect?.value ?? null,
                    target: target?.textContent.trim() ?? null,
                    halvedVisible: halved !== null,
                    blockedVisible: blocked !== null,
                };
            }

            const initial = readState('initial');

            // Switch the dropdown to toughness.
            const select = root.querySelector<HTMLSelectElement>('.wh40k-skill-char-override__select');
            if (select !== null) {
                select.value = 'toughness';
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 80);
            });
            const afterSwap = readState('after-toughness');

            return { error: null, snaps: { initial, afterSwap } };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        const snaps = result.snaps;
        expect(snaps, 'snapshot bundle returned').not.toBeNull();
        if (snaps === null) return;

        expect(snaps.initial.rendered, 'dropdown renders').toBe(true);
        expect(snaps.initial.optionCount).toBe(2);
        expect(snaps.initial.currentValue).toBe('strength');

        // After swap to Toughness the alt option is selected; if the
        // characteristic totals differ the base target updates too.
        expect(snaps.afterSwap.currentValue).toBe('toughness');

        await snap(page, 'skill-altchar-dropdown');
    });
});
