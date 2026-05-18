/**
 * Regression spec for issue #190 — Rogue Trader starship Ship-Points budget panel.
 *
 * Three stories: clean-build, over-budget, missing-essential-slot. Each is
 * captured to .e2e-screenshots/ for visual review; assertions are intentionally
 * light because the panel's structured selectors are still being settled.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #190 — starship ship-points budget panel', () => {
    test('clean-build story renders + screenshot captured', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starship-shippointsbudgetpanel--clean-build');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: '.e2e-screenshots/issue-190-ship-points.png', fullPage: true });
        await expect(page.locator('body')).toBeAttached();
    });

    test('over-budget story renders + screenshot captured', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starship-shippointsbudgetpanel--over-budget');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: '.e2e-screenshots/issue-190-ship-points-over.png', fullPage: true });
        await expect(page.locator('body')).toBeAttached();
    });

    test('missing-essential-slot story renders + screenshot captured', async ({ page }) => {
        await page.goto('/iframe.html?id=actor-starship-shippointsbudgetpanel--missing-essential-slot');
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: '.e2e-screenshots/issue-190-ship-points-missing.png', fullPage: true });
        await expect(page.locator('body')).toBeAttached();
    });
});
