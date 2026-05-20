import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * e2e snapshot for the DH2 "Replace damage die with DoS" action (#129 —
 * core.md L10398-10414). Renders `damage-roll-chat.hbs` directly via
 * Foundry's `renderTemplate` API with an inline context that simulates a
 * successful attack carrying positive Degrees of Success, then asserts:
 *
 *   1. The amber replacement button appears when `canReplaceDie` is true
 *      AND `hit.dos > 0`.
 *   2. The button carries the data attributes the action manager reads
 *      (`data-roll-id`, `data-hit-index`, `data-dos`).
 *   3. The button is omitted when `hit.dos === 0` (a failed-ish attack
 *      shouldn't offer the option).
 *
 * Posting the rendered card to the chat log is covered by the broader
 * `chat-cards.spec.ts` sweep; this spec exists to lock the new button
 * surface in place.
 */

test.describe.serial('damage die replacement chat card (#129)', () => {
    test('renders the replacement button when DoS > 0', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const errors: string[] = [];
        page.on('pageerror', (err: Error) => errors.push(err.message));

        const result = await page.evaluate(async () => {
            /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
            const renderTemplate = (globalThis as any).foundry?.applications?.handlebars?.renderTemplate as
                | ((p: string, c: object) => Promise<string>)
                | undefined;
            if (!renderTemplate) return { withDoS: '', withoutDoS: '' };
            const template = 'systems/wh40k-rpg/templates/chat/damage-roll-chat.hbs';
            const withDoS = await renderTemplate(template, {
                weaponName: 'Bolt Pistol',
                rollId: 'e2e-roll-129',
                canReplaceDie: true,
                hits: [
                    {
                        location: 'Body',
                        damageRoll: { formula: '1d10+3', result: '6 + 3' },
                        modifiers: {},
                        totalDamage: 9,
                        damageType: 'Explosive',
                        totalPenetration: 4,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [],
                        dos: 3,
                    },
                ],
                targetActor: null,
            });
            const withoutDoS = await renderTemplate(template, {
                weaponName: 'Bolt Pistol',
                rollId: 'e2e-roll-129b',
                canReplaceDie: true,
                hits: [
                    {
                        location: 'Body',
                        damageRoll: { formula: '1d10+3', result: '4 + 3' },
                        modifiers: {},
                        totalDamage: 7,
                        damageType: 'Explosive',
                        totalPenetration: 4,
                        totalFatigue: 0,
                        effects: [],
                        righteousFury: [],
                        dos: 0,
                    },
                ],
                targetActor: null,
            });
            return { withDoS, withoutDoS };
            /* eslint-enable @typescript-eslint/no-explicit-any */
        });

        expect(errors, `pageerror events: ${errors.join('\n')}`).toEqual([]);

        // With DoS > 0 the amber button should be present and carry the
        // wiring metadata the basic-action-manager handler reads back.
        expect(result.withDoS).toContain('roll-control__replace-damage-die');
        expect(result.withDoS).toContain('data-action="replaceDamageDieWithDoS"');
        expect(result.withDoS).toContain('data-roll-id="e2e-roll-129"');
        expect(result.withDoS).toContain('data-hit-index="0"');
        expect(result.withDoS).toContain('data-dos="3"');
        // Amber accent per the brief.
        expect(result.withDoS).toContain('tw-bg-amber-500/20');

        // With DoS = 0 the button is omitted.
        expect(result.withoutDoS).not.toContain('roll-control__replace-damage-die');
    });
});
