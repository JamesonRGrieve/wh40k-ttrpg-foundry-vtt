/**
 * Regression spec for issue #216 — "Duplicate aptitude option still
 * displays as a requirement even if it is selected".
 *
 * Pre-fix the warning banner unconditionally listed every entry in
 * `preview.aptitudeCollisions`, so a collision the player had already
 * resolved via the chooser still appeared as an outstanding requirement.
 *
 * The fix splits the collision list into `unresolvedAptitudeCollisions`
 * (drives the warning banner) and `resolvedAptitudeCollisions` (drives a
 * neutral applied-swap sub-section with a Change affordance). The warning
 * banner only renders for genuinely-outstanding entries.
 *
 * This spec opens the post-select Storybook story
 * (`Issue216ResolvedAptitudeNotARequirement`) and asserts:
 *   - the warning banner is absent (the actual bug);
 *   - the resolved-applied banner is present (so the player can Change);
 * paired with the pre-select sibling story that exercises the opposite.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #216 — resolved aptitude collision no longer renders as requirement', () => {
    test('post-select: warning banner absent, resolved-banner present with Change affordance', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (err) => consoleErrors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-216-resolved-aptitude-not-a-requirement');

        // Screenshot first so visual review has the artefact even if a later
        // assertion drops.
        await page.screenshot({ path: '.e2e-screenshots/issue-216-resolved-aptitude.png', fullPage: true });

        // The warning banner MUST NOT render — this is the load-bearing bug
        // assertion.
        await expect(page.getByTestId('aptitude-collision-banner')).toHaveCount(0);

        // The resolved-applied list MUST be present so the player can still
        // Change their choice. The arrow + replacement label is visible.
        await expect(page.getByTestId('aptitude-collision-resolved-banner')).toHaveCount(1);
        await expect(page.getByTestId('aptitude-collision-resolved').filter({ has: page.locator('[data-aptitude="Willpower"]') }).first()).toBeVisible();

        void consoleErrors;
    });

    test('pre-select: warning banner present (sibling story confirms requirement framing for unresolved entries)', async ({ page }) => {
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-216-unresolved-aptitude-is-a-requirement');
        await page.screenshot({ path: '.e2e-screenshots/issue-216-unresolved-aptitude.png', fullPage: true });

        await expect(page.getByTestId('aptitude-collision-banner')).toHaveCount(1);
        await expect(page.getByTestId('aptitude-collision-resolved-banner')).toHaveCount(0);
        await expect(page.getByTestId('aptitude-collision-unresolved').filter({ has: page.locator('[data-aptitude="Willpower"]') }).first()).toBeVisible();
    });
});
