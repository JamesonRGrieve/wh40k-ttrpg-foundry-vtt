/**
 * Regression test for issue #202.
 *
 * The Origin-Roll dialog (Starting Wounds / Fate / Throne Gelt) used to grow
 * unbounded as the "Previous Attempts" section accumulated rerolls. After ~6
 * rerolls the Reroll and Submit buttons were pushed below the viewport, so
 * players could no longer accept or reroll.
 *
 * The fix constrains the dialog body to a max height, makes the body
 * scrollable, and pins the action footer (Reroll / Cancel / Accept) to the
 * bottom via `flex-shrink-0`. The Previous Attempts list also gets its own
 * inner scroll container so the layout stays compact even with many rolls.
 *
 * This spec loads the `RerollOverflow` story (10 previous attempts inside a
 * 520x640 viewport frame), screenshots the result for visual review, and
 * asserts both the Reroll button and the Accept (Submit) button remain inside
 * the rendered viewport.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #202 — Origin-Roll dialog reroll overflow', () => {
    test('Reroll and Accept buttons stay visible with 10 previous attempts', async ({ page }) => {
        // The viewport frame around the story is 520 tall; size the page tall
        // enough that anything inside is in-viewport iff it's inside the frame.
        await page.setViewportSize({ width: 1024, height: 768 });
        await page.goto('/iframe.html?id=character-creation-originrolldialog--reroll-overflow');

        const previousAttemptsList = page.locator('[data-testid="previous-attempts-list"]');
        await expect(previousAttemptsList).toBeVisible();
        await expect(previousAttemptsList.locator('li')).toHaveCount(10);

        const actionFooter = page.locator('[data-testid="origin-roll-actions"]');
        await expect(actionFooter).toBeVisible();

        const rerollBtn = page.locator('button[data-action="reroll"]');
        const acceptBtn = page.locator('button[data-action="accept"]');

        // Core assertions: the Reroll and Accept buttons are in the viewport
        // even though 10 previous attempts have accumulated.
        await expect(rerollBtn).toBeInViewport();
        await expect(acceptBtn).toBeInViewport();

        // Capture the visual artefact for review attached to issue #202.
        await page.screenshot({
            path: '.e2e-screenshots/issue-202-reroll-overflow.png',
            fullPage: false,
        });

        // Scroll the inner history container to its bottom and re-verify the
        // pinned footer + reroll/accept buttons remain in viewport — the
        // history is allowed to scroll but the action footer is not.
        await previousAttemptsList.evaluate((el) => {
            el.scrollTop = el.scrollHeight;
        });
        await expect(rerollBtn).toBeInViewport();
        await expect(acceptBtn).toBeInViewport();
    });
});
