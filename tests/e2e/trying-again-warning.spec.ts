import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e coverage for #62 — Trying Again warning on the unified roll dialog.
 *
 * Per core.md §"Trying Again" (p. 96), some skills cannot be retried within
 * the same scene without a circumstance change, and others incur a cumulative
 * -10. The dialog surfaces this as a soft warning when the actor has already
 * attempted the skill (tracked via `actor.flags.wh40k['try-again'][skillKey]`).
 *
 * This spec:
 *   1. creates a synthetic DH2 actor with `flags.wh40k.try-again.inquiry = 1`,
 *   2. opens UnifiedRollDialog against a Skill rollData targeting `inquiry`,
 *   3. asserts the `wh40k-try-again-warning` banner is rendered, and
 *   4. captures a screenshot of the active dialog.
 */

test.describe.serial('trying again warning (#62)', () => {
    test('renders warning banner when retry count > 0 for a no-retry skill', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const result = await page.evaluate(async () => {
            interface DialogInstance {
                // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 render returns Promise<this> with no shipped types
                render: (force: boolean) => Promise<unknown>;
                element?: HTMLElement;
                // eslint-disable-next-line no-restricted-syntax -- boundary: ApplicationV2 close returns Promise<this> with no shipped types
                close?: () => Promise<unknown>;
            }
            interface DialogModule {
                default: new (actionData: object) => DialogInstance;
            }
            const modUrl = '/systems/wh40k-rpg/module/applications/prompts/unified-roll-dialog.js';
            // eslint-disable-next-line no-restricted-syntax -- boundary: dynamic import returns `any`; cast to typed dialog module shape
            const mod = (await import(/* @vite-ignore */ modUrl)) as unknown as DialogModule;
            const Cls = mod.default;
            if (typeof Cls !== 'function') {
                return { error: 'UnifiedRollDialog default export missing', rendered: false };
            }

            // Build a synthetic actor stub with a getFlag implementation that
            // returns the try-again bag. The dialog only reads getFlag('wh40k',
            // 'try-again') and ignores everything else on the actor for the
            // warning path.
            interface TryAgainBag {
                [key: string]: number | undefined;
            }
            interface ActorStub {
                name: string;
                img: string;
                flags: { wh40k: { 'try-again': TryAgainBag } };
                getFlag: (scope: string, key: string) => number | TryAgainBag | null;
                getSituationalModifiers: () => never[];
            }
            const actorStub: ActorStub = {
                name: 'Probe Acolyte',
                img: '',
                flags: { wh40k: { 'try-again': { inquiry: 1 } } },
                getFlag(scope: string, key: string): number | TryAgainBag | null {
                    if (scope !== 'wh40k') return null;
                    if (key === 'try-again') return this.flags.wh40k['try-again'];
                    return this.flags.wh40k['try-again'][key] ?? null;
                },
                getSituationalModifiers(): never[] {
                    return [];
                },
            };

            // Synthetic Skill-shaped rollData. `type: 'Skill'` + `rollKey: 'inquiry'`
            // are what trigger the try-again advisory lookup.
            class SkillRollData {
                name = 'Inquiry';
                type = 'Skill';
                rollKey = 'inquiry';
                baseTarget = 40;
                modifiers: Record<string, number> = {};
                rangeBonus = 0;
                sourceActor = actorStub;
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
                name: 'Inquiry',
                rollData: new SkillRollData(),
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
                return { error: `dialog render threw: ${err instanceof Error ? err.message : String(err)}`, rendered: false };
            }

            await new Promise<void>((r) => {
                setTimeout(r, 100);
            });
            const root = dialog.element;
            if (!(root instanceof HTMLElement)) {
                return { error: 'dialog.element is not an HTMLElement', rendered: false };
            }

            const banner = root.querySelector<HTMLElement>('.wh40k-try-again-warning');
            const hint = root.querySelector<HTMLElement>('.wh40k-try-again-warning__hint');
            return {
                error: null,
                rendered: banner !== null,
                hintText: hint !== null ? hint.textContent.trim() : null,
            };
        });

        expect(result.error, result.error ?? 'ok').toBeNull();
        expect(result.rendered, 'try-again warning banner renders').toBe(true);
        expect(result.hintText, 'hint text is populated').not.toBeNull();

        await snap(page, 'try-again-warning');
    });
});
