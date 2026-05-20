/**
 * Issue #27 regression test — the skill hover tooltip's row labels for
 * the characteristic and the untrained-target value must be plain
 * English, not "[Chrstc] Value" / "Base (/2 untrained):" jargon.
 *
 * Old (unexplained):  "Per Characteristic Total: 35"  +  "Base (/2 untrained): 17"
 * New (self-explanatory):
 *   "Characteristic: Per (35)"
 *   "Untrained target (characteristic ÷ 2): 17"  (RT only — DH2-family doesn't halve)
 *
 * The test points at the Storybook-built skill-tooltip story and asserts
 * the new labels are present (and the old jargon-y label is gone), then
 * captures a screenshot to .e2e-screenshots/ for visual review.
 */

import { expect, test } from '@playwright/test';

test.describe('Issue #27 — Self-explanatory skill tooltip labels', () => {
    test('characteristic row reads as a complete sentence', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-skilltooltip--untrained');

        const host = page.locator('[data-testid="skill-tooltip-host"]');
        await expect(host).toBeAttached();

        const breakdown = host.locator('.wh40k-tooltip__breakdown');
        await expect(breakdown).toBeVisible();

        // New label: "Characteristic: Per (35)" — name and value in one row,
        // no separate "Value" column or unexplained label.
        await expect(breakdown).toContainText('Characteristic: Per (35)');

        // Regression guard: the old wording placed the characteristic name
        // BEFORE an unexplained "Characteristic Total" label. That phrasing
        // should no longer appear in the breakdown — only the new sentence.
        const breakdownText = (await breakdown.textContent()) ?? '';
        expect(breakdownText).not.toMatch(/Per\s+Characteristic Total:/);

        await page.screenshot({
            path: '.e2e-screenshots/issue-27-tooltip-labels.png',
            fullPage: true,
        });
    });
});
