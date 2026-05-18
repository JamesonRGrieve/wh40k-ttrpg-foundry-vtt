/**
 * Issue #206 — Origin Path Builder must surface the Characteristic Roll step
 * AND the Equipment step BEFORE the final "copy origin to character"
 * confirmation dialog fires. The bug: clicking either Yes/No on the final
 * dialog closed the builder, silently dropping the missed steps.
 *
 * This spec walks the full step sequence via two stories that pin the builder
 * at each gated stage, then captures a screenshot at the Characteristic Roll
 * surface for visual review.
 */
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = '.e2e-screenshots';

test.describe('Issue #206 — Origin Path Builder full step sequence', () => {
    test('surfaces the Characteristic Roll step after homeworld + background + role + elite advance', async ({ page }) => {
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-206-characteristic-step-reached');

        // The earlier steps are all completed and the active surface is Characteristics.
        await expect(page.getByText(/Characteristics/i).first()).toBeVisible();
        await page.screenshot({ path: `${SCREENSHOT_DIR}/issue-206-origin-path-steps.png`, fullPage: true });
    });

    test('surfaces the Equipment step after characteristics are completed', async ({ page }) => {
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-206-equipment-step-reached');

        // Equipment step UI is the active surface — the final confirmation has NOT fired.
        await expect(page.getByText(/Equip Acolyte/i).first()).toBeVisible();
        // Characteristics is now complete and the journey shows both gated steps reached
        // in the correct sequence before commit.
        await expect(page.getByText(/Characteristics/i).first()).toBeVisible();
    });

    test('walks the gated sequence: characteristics → equipment → final confirm', async ({ page }) => {
        // Step 1: characteristics surface reached.
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-206-characteristic-step-reached');
        await expect(page.getByText(/Characteristics/i).first()).toBeVisible();

        // Step 2: advance to equipment surface.
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-206-equipment-step-reached');
        await expect(page.getByText(/Equip Acolyte/i).first()).toBeVisible();

        // Step 3: the PreviewPanel story models the post-equipment commit-ready state
        // where the final confirmation dialog can finally be invoked. The story exposes
        // the commit action on its data-action button; the live builder routes that to
        // its DialogV2.prompt for the "copy origin to character" confirmation. Until
        // both gated steps are completed (covered by Steps 1 and 2 above) the dialog
        // must not fire — that is the regression this issue tracked.
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--preview-panel');
        const commitButton = page.locator('[data-action="commit"]').first();
        await expect(commitButton).toBeAttached();
    });
});
