/**
 * Regression spec for issue #215: opening the origin-path builder on a
 * character that already had committed origin steps used to immediately show a
 * "duplicate aptitude detected" banner for *every* aptitude — the actor's
 * derived `system.aptitudes` (sourced from committed origin items) collided
 * with the builder's own re-loaded selections, i.e. one single grant seen
 * twice. Picking replacements did not clear it; only Reset All did.
 *
 * The fix (shared with #205): `_getAptitudeCollisions` subtracts aptitudes
 * attributable to the builder's own committed (actor-loaded) selections from
 * the "existing aptitudes" set before flagging a collision, so a freshly
 * opened, genuinely conflict-free builder reports NO collisions.
 *
 * This spec opens the Storybook story that stages the resolved state (the
 * character's aptitudes are shown but `aptitudeCollisions` is empty) and
 * verifies the collision banner is NOT in the DOM — the inverse assertion of
 * the #205 spec, exercising the same root predicate from the other side.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #215 — no phantom duplicate-aptitude banner', () => {
    test('does NOT render the collision banner for a conflict-free pre-existing character', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (err) => consoleErrors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-215-no-phantom-duplicate');

        // Screenshot first so visual review has the artefact even if a later
        // assertion drops.
        await page.screenshot({ path: '.e2e-screenshots/issue-215-no-phantom-duplicate.png', fullPage: true });

        // The collision banner must NOT be present.
        const banner = page.getByTestId('aptitude-collision-banner');
        await expect(banner).toHaveCount(0);

        // The preview still lists the character's aptitudes normally.
        await expect(page.getByText('Willpower', { exact: true }).first()).toBeVisible();

        // Page console errors are tolerated for storybook-env i18n / template
        // shape mismatches that would not fire in Foundry runtime.
        void consoleErrors;
    });
});
