/**
 * Issue #26 regression test — skill training progression renders the
 * DH2 RAW 5-level ladder with each rank's modifier REPLACING (not
 * adding to) the previous level's modifier.
 *
 * Old (wrong) ladder: Untrained (-20) → Trained (0) → +10 → +20
 * New (correct):      Untrained (-20) → Known (0) → Trained (+10) → Experienced (+20) → Veteran (+30)
 *
 * The test points at the Storybook-built skill-tooltip story and asserts
 * the rendered DOM contains all five rungs with their correct modifiers,
 * then captures a screenshot to .e2e-screenshots/ for visual review.
 */

import { expect, test } from '@playwright/test';

test.describe('Issue #26 — Skill training progression', () => {
    test('renders the 5-tier DH2 ladder with rank-specific modifiers', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-skilltooltip--untrained');

        // The story renders asynchronously (the tooltip builder is async),
        // so wait for the resolved host node rather than the "pending"
        // placeholder.
        const host = page.locator('[data-testid="skill-tooltip-host"]');
        await expect(host).toBeAttached();

        const track = host.locator('.wh40k-tooltip__training-track');
        await expect(track).toBeVisible();

        // Untrained rung carries the flat -20 penalty (DH2 aptitude rule).
        await expect(track).toContainText('Untrained');
        await expect(track).toContainText('-20');

        // The four trained-tier rungs each show their own modifier value
        // (NOT a running sum — +10 is +10, not +30).
        await expect(track).toContainText('Known');
        await expect(track).toContainText('+0');
        await expect(track).toContainText('Trained');
        await expect(track).toContainText('+10');
        await expect(track).toContainText('Experienced');
        await expect(track).toContainText('+20');
        await expect(track).toContainText('Veteran');
        await expect(track).toContainText('+30');

        await page.screenshot({
            path: '.e2e-screenshots/issue-26-skill-progression.png',
            fullPage: true,
        });
    });

    test('Trained PC highlights +10 — not +20 — as the active rung', async ({ page }) => {
        await page.goto('/iframe.html?id=shared-skilltooltip--trained-plus-10');

        const host = page.locator('[data-testid="skill-tooltip-host"]');
        await expect(host).toBeAttached();

        const active = host.locator('.wh40k-tooltip__training-track span.active');
        await expect(active).toContainText('Trained');
        await expect(active).toContainText('+10');
        // Regression guard: the previously-buggy UI surfaced +20 here.
        await expect(active).not.toContainText('+20');
    });
});
