/**
 * Regression spec for issue #190: the starship sheet must surface the hull's
 * SP budget vs amount spent, list the RAW-required essential component slots,
 * and prevent the build from being saved when any essential slot is empty or
 * the spent SP exceeds the hull's budget.
 *
 * The Storybook stories at `Actor/Starship/ShipPointsBudgetPanel` render the
 * panel in three canonical states:
 *   • CleanBuild              — within budget, every slot filled.
 *   • OverBudget              — slots filled but over budget.
 *   • MissingEssentialSlot    — within budget but two essential slots empty.
 *
 * Each is loaded below and the relevant indicator is asserted. The clean-
 * build state also produces a screenshot for visual review.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #190 — starship ship-points budget panel', () => {
    test('clean-build story shows valid status and the Save Build button is enabled', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starship-shippointsbudgetpanel--clean-build');

        const panel = page.locator('[data-component="ship-points-budget"]');
        await expect(panel).toBeVisible();

        // Spent / budget figures render.
        await expect(panel.locator('[data-field="spent"]')).toHaveText('38');
        await expect(panel.locator('[data-field="budget"]')).toHaveText('40');

        // Status reads "valid" (translated label is whatever the lang file says;
        // the data-state attribute is the stable hook).
        await expect(panel.locator('.wh40k-ship-points-budget__status')).toHaveAttribute('data-state', 'valid');

        // No "missing"-state slot rows.
        await expect(panel.locator('.wh40k-ship-points-budget__slot[data-filled="false"]')).toHaveCount(0);

        // No over-budget banner.
        await expect(panel.locator('[data-state="over-budget"]')).toHaveCount(0);

        // Commit button is NOT disabled.
        const commit = panel.locator('button[data-action="commitBuild"]');
        await expect(commit).not.toHaveAttribute('disabled', '');

        await page.screenshot({ path: '.e2e-screenshots/issue-190-ship-points.png', fullPage: true });
    });

    test('over-budget story shows the over-budget indicator and disables Save Build', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starship-shippointsbudgetpanel--over-budget');

        const panel = page.locator('[data-component="ship-points-budget"]');
        await expect(panel).toBeVisible();

        // Over-budget banner present.
        const banner = panel.locator('[data-state="over-budget"]');
        await expect(banner).toBeVisible();

        // Status reads "invalid".
        await expect(panel.locator('.wh40k-ship-points-budget__status')).toHaveAttribute('data-state', 'invalid');

        // Commit button is disabled.
        const commit = panel.locator('button[data-action="commitBuild"]');
        await expect(commit).toHaveAttribute('disabled', '');
        await expect(commit).toHaveAttribute('aria-disabled', 'true');

        // The spent figure carries the crimson-text class signalling the overage.
        await expect(panel.locator('[data-field="spent"]')).toHaveClass(/tw-text-crimson/);
    });

    test('missing-essential-slot story highlights every empty required slot', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starship-shippointsbudgetpanel--missing-essential-slot');

        const panel = page.locator('[data-component="ship-points-budget"]');
        await expect(panel).toBeVisible();

        // No over-budget banner (the over/under-budget axes are independent).
        await expect(panel.locator('[data-state="over-budget"]')).toHaveCount(0);

        // Exactly two rows are flagged as missing (gellarField + warpDrive).
        const missingRows = panel.locator('.wh40k-ship-points-budget__slot[data-filled="false"]');
        await expect(missingRows).toHaveCount(2);
        await expect(panel.locator('.wh40k-ship-points-budget__slot[data-slot="gellarField"]')).toHaveAttribute('data-filled', 'false');
        await expect(panel.locator('.wh40k-ship-points-budget__slot[data-slot="warpDrive"]')).toHaveAttribute('data-filled', 'false');

        // Filled slots still report filled.
        await expect(panel.locator('.wh40k-ship-points-budget__slot[data-slot="bridge"]')).toHaveAttribute('data-filled', 'true');

        // Status reads "invalid" and Save Build is disabled.
        await expect(panel.locator('.wh40k-ship-points-budget__status')).toHaveAttribute('data-state', 'invalid');
        const commit = panel.locator('button[data-action="commitBuild"]');
        await expect(commit).toHaveAttribute('disabled', '');
    });
});
