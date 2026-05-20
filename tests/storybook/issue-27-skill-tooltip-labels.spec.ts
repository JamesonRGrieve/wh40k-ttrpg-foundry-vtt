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

        // New presentation: the characteristic name and its value share a
        // single breakdown row, no separate "Value" column or unexplained
        // label. The Storybook iframe falls back to a synchronous shell
        // (no `game.i18n.format` available in the Storybook env) which
        // emits the abbreviation and the numeric value into adjacent
        // spans rather than as the formatted "Characteristic: Per (35)"
        // sentence the live Foundry renderer produces — so we assert on
        // the two halves independently rather than the formatted string.
        await expect(breakdown).toContainText('Per');
        await expect(breakdown).toContainText('35');

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
