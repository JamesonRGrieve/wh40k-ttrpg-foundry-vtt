/**
 * Issue #19 — clicking a non-Reaction combat action in the Actions tab must
 * show the action description locally (sheet popout / tooltip) rather than
 * auto-posting to chat. Reactions (Dodge/Parry) already behaved that way;
 * the fix in src/module/applications/actor/character-sheet.ts brings every
 * other combat action — combat talents, attacks, movement, utility — in
 * line with that default. Posting to chat is now an explicit Shift+Click.
 */

import { expect, test } from '@playwright/test';

test.describe('Issue #19 — non-Reaction combat action click', () => {
    test('shows description locally, does not post a chat message', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-charactersheet--issue-19-non-reaction-local-description');
        // Let the story render + the inline click-handler register.
        await page.waitForLoadState('networkidle');
        // Capture state-of-render screenshot before any assertions, so visual
        // review has it even if a later assertion fails.
        await page.screenshot({ path: '.e2e-screenshots/issue-19-action-clicked.png', fullPage: true });

        // The combat-actions-panel partial must be rendered.
        await expect(page.locator('[data-action="vocalizeCombatAction"]').first()).toBeVisible();

        // The combat-talent button must route through the local-description
        // action, NOT the legacy itemVocalize (which auto-posted to chat).
        await expect(page.locator('[data-action="combatTalentDescribe"]').first()).toBeVisible();
        await expect(page.locator('[data-action="itemVocalize"]')).toHaveCount(0);

        // The button's title attribute must communicate the Shift+Click affordance.
        const talentTitle = await page.locator('[data-action="combatTalentDescribe"]').first().getAttribute('title');
        expect(talentTitle ?? '').toContain('Shift+Click');

        // Click a non-Reaction (attack) action. The story's click handler
        // mirrors the sheet's static-method local-tooltip fallback so the
        // behaviour is observable from the browser side.
        const attackButton = page.locator('[data-action="vocalizeCombatAction"]').first();
        await attackButton.click();

        // The local-description path must have fired (data-tooltip set,
        // data-issue19-described-locally marker present); the chat-post path
        // must NOT have fired.
        await expect(attackButton).toHaveAttribute('data-issue19-described-locally', 'true');
        await expect(attackButton).not.toHaveAttribute('data-issue19-posted-to-chat', /.*/);
        const tooltip = await attackButton.getAttribute('data-tooltip');
        expect(tooltip ?? '').not.toBe('');

        // No chat-message DOM exists anywhere in the rendered iframe.
        await expect(page.locator('.chat-message')).toHaveCount(0);
        await expect(page.locator('ol#chat-log .chat-message')).toHaveCount(0);

        // Capture a screenshot for the verification sweep.
        await page.screenshot({ path: '.e2e-screenshots/issue-19-action-clicked.png', fullPage: true });
    });
});
