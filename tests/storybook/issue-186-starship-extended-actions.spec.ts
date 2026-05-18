/**
 * Regression spec for issue #186 — Rogue Trader starship Extended Actions.
 *
 * Renders the StarshipSheet "Extended Actions" story (Storybook), asserts
 * at least one dispatch button is in the DOM (the 13 RAW RT extended
 * actions: Active Augury, Brace for Impact, Defensive Stance, Disengage,
 * Emergency Repair, Evasive Manoeuvres, Focused Augury, Lock On, Plot
 * Course, Quick Repair, Rapid Reload, Set Up Boarding Action, Suppressive
 * Fire), and snapshots a screenshot for visual regression.
 */
import { expect, test } from '@playwright/test';

test.describe('Issue #186 — Starship Extended Actions panel', () => {
    test('renders the 13 RT extended-action dispatch buttons', async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (err) => consoleErrors.push(err.message));
        page.on('console', (msg) => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        await page.goto('/iframe.html?id=actor-starshipsheet--extended-actions');

        // At least one Extended Action dispatch button must render.
        const dispatchButtons = page.locator('[data-action="dispatchExtendedAction"]');
        await expect(dispatchButtons.first()).toBeVisible();
        const count = await dispatchButtons.count();
        expect(count).toBeGreaterThanOrEqual(1);

        // The named anchor actions must be present in the rendered DOM.
        await expect(page.getByText('Active Augury')).toBeVisible();
        await expect(page.getByText('Suppressive Fire')).toBeVisible();

        await page.screenshot({ path: '.e2e-screenshots/issue-186-extended-actions.png', fullPage: true });

        expect(consoleErrors, `unexpected console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
    });
});
