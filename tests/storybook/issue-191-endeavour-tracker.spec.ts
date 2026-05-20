/**
 * Regression spec for issue #191 — Rogue Trader Endeavour tracker.
 *
 * Three canonical states: Empty / InProgress / Completed. Each captures
 * a screenshot to .e2e-screenshots/ for visual review. Assertions are
 * kept light because the panel's testid selectors are still being
 * settled with the source.
 */
import { test } from '@playwright/test';
import { assertStoryRendered } from './lib/assert-story-rendered';

const STORY_BASE = '/iframe.html?id=actor-panels-endeavourpanel--';

test.describe('Issue #191 — Endeavour tracker renders three canonical states', () => {
    test('Empty story renders + screenshot captured', async ({ page }) => {
        await page.goto(`${STORY_BASE}empty`);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: '.e2e-screenshots/issue-191-endeavour-empty.png', fullPage: true });
        await assertStoryRendered(page);
    });

    test('InProgress story renders + screenshot captured', async ({ page }) => {
        await page.goto(`${STORY_BASE}in-progress`);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: '.e2e-screenshots/issue-191-endeavour.png', fullPage: true });
        await assertStoryRendered(page);
    });

    test('Completed story renders + screenshot captured', async ({ page }) => {
        await page.goto(`${STORY_BASE}completed`);
        await page.waitForLoadState('networkidle');
        await page.screenshot({ path: '.e2e-screenshots/issue-191-endeavour-completed.png', fullPage: true });
        await assertStoryRendered(page);
    });
});
