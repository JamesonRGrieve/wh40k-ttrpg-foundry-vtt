import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * e2e snapshot for the DH2 Assassin's Strike post-attack action
 * (#149 — DH2 errata L75). Renders `action-roll-chat.hbs` directly
 * via Foundry's `renderTemplate` API with an inline context that
 * simulates a successful melee attack from an actor carrying the
 * Assassin's Strike talent, then asserts:
 *
 *   1. The dark-grey ninja button renders when `hasAssassinsStrike`
 *      is true on the chat-card context AND the attack succeeded.
 *   2. The button carries the data attributes the action manager
 *      reads back (`data-action="assassinsStrike"`, `data-roll-id`).
 *   3. The button is omitted when the actor lacks the talent.
 *
 * Posting the rendered card to the chat log is covered by the
 * broader `chat-cards.spec.ts` sweep; this spec exists to lock the
 * new button surface in place.
 */

test.describe.serial("assassin's strike chat card (#149)", () => {
    test('renders the post-attack button when the talent is present', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const errors: string[] = [];
        page.on('pageerror', (err: Error) => errors.push(err.message));

        const result = await page.evaluate(async () => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `foundry` global is injected by the licensed app; no shipped types
            const g = globalThis as unknown as {
                foundry?: { applications?: { handlebars?: { renderTemplate?: (p: string, c: object) => Promise<string> } } };
            };
            const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
            if (!renderTemplateFn) return { withTalent: '', withoutTalent: '', withTalentMissed: '' };
            const template = 'systems/wh40k-rpg/templates/chat/action-roll-chat.hbs';
            const baseHit = {
                id: 'e2e-roll-149',
                label: 'Melee Attack',
                rollData: {
                    name: 'Power Knife',
                    action: 'Standard Attack',
                    isManualRoll: false,
                    ignoreModifiers: true,
                    ignoreDegrees: false,
                    ignoreSuccess: false,
                    ignoreControls: false,
                    isOpposed: false,
                    isTargetOnly: false,
                    success: true,
                    dos: 2,
                    dof: 0,
                    roll: { total: 32 },
                    hitLocation: 'Body',
                    showDamage: true,
                },
            };
            const withTalent = await renderTemplateFn(template, { ...baseHit, hasAssassinsStrike: true });
            const withoutTalent = await renderTemplateFn(template, { ...baseHit, hasAssassinsStrike: false });
            const withTalentMissed = await renderTemplateFn(template, {
                ...baseHit,
                hasAssassinsStrike: true,
                rollData: { ...baseHit.rollData, success: false, dos: 0, dof: 2, roll: { total: 78 }, showDamage: false },
            });
            return { withTalent, withoutTalent, withTalentMissed };
        });

        expect(errors, `pageerror events: ${errors.join('\n')}`).toEqual([]);

        // Talent present + successful melee attack → the button is wired in.
        expect(result.withTalent).toContain('roll-control__assassins-strike');
        expect(result.withTalent).toContain('data-action="assassinsStrike"');
        expect(result.withTalent).toContain('data-roll-id="e2e-roll-149"');
        // Dark grey ninja accent per the brief.
        expect(result.withTalent).toContain('tw-bg-gray-800/60');
        expect(result.withTalent).toContain('tw-text-gray-100');

        // No talent → button is omitted.
        expect(result.withoutTalent).not.toContain('roll-control__assassins-strike');

        // Talent present but the attack missed → button is omitted (errata
        // only triggers the test on a successful melee attack).
        expect(result.withTalentMissed).not.toContain('roll-control__assassins-strike');

        // Snapshot the talent-present render for visual regression.
        await snap(page, 'assassins-strike-button');
    });
});
