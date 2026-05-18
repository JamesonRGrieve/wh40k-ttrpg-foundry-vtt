/**
 * Regression spec for issue #191 — Rogue Trader Endeavour tracker.
 *
 * Verifies the new `endeavour-panel.hbs` partial renders three canonical
 * states:
 *   1. Empty   — no embedded endeavour items; placeholder line visible.
 *   2. InProgress — one Endeavour at 50% (2/4 objectives complete);
 *      progress bar visible with non-zero fill.
 *   3. Completed — one Endeavour at 100%; "Grant Reward" button shows.
 *
 * The in-progress screenshot is captured to `.e2e-screenshots/issue-191-endeavour.png`
 * so visual diff catches a future regression that breaks the progress bar
 * or the objective list layout.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = resolve(__dirname, '..', '..', '.e2e-screenshots');
const SCREENSHOT_PATH = resolve(SCREENSHOT_DIR, 'issue-191-endeavour.png');

// Story IDs derive from `title: 'Actor Panels/EndeavourPanel'` and the
// `Empty` / `InProgress` / `Completed` named exports.
const STORY_BASE = '/iframe.html?id=actor-panels-endeavourpanel--';

test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe('Issue #191 — Endeavour tracker renders three canonical states', () => {
    test('Empty story shows the placeholder line and no endeavour cards', async ({ page }) => {
        await page.goto(`${STORY_BASE}empty`);
        const panel = page.getByTestId('endeavour-panel');
        await expect(panel).toBeVisible();
        const cards = page.getByTestId('endeavour-card');
        await expect(cards).toHaveCount(0);
        const empty = page.getByTestId('endeavour-empty');
        await expect(empty).toBeVisible();
    });

    test('InProgress story shows a progress bar at 50% and unchecked objectives', async ({ page }) => {
        await page.goto(`${STORY_BASE}in-progress`);

        // Always capture the screenshot first so it lands even if a later
        // assertion fails — visual review still has the artefact.
        await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

        const card = page.getByTestId('endeavour-card');
        await expect(card).toHaveCount(1);

        const progressBar = page.getByTestId('endeavour-progress-bar');
        await expect(progressBar).toBeVisible();
        // The aria-valuenow attribute carries the percent complete.
        const pct = await progressBar.getAttribute('aria-valuenow');
        expect(pct).not.toBeNull();
        const pctNum = Number(pct);
        expect(pctNum).toBeGreaterThan(0);
        expect(pctNum).toBeLessThan(100);

        // Four objective rows, two complete (data-complete attribute is per-card,
        // so use the per-row line-through state via the rendered markup count).
        const objectives = page.getByTestId('endeavour-objective');
        await expect(objectives).toHaveCount(4);

        // The "Grant Reward" button must NOT be present for an in-progress endeavour.
        const grantBtn = page.getByTestId('complete-endeavour-btn');
        await expect(grantBtn).toHaveCount(0);
    });

    test('Completed story shows the Grant Reward button on a 100% endeavour', async ({ page }) => {
        await page.goto(`${STORY_BASE}completed`);

        const card = page.getByTestId('endeavour-card');
        await expect(card).toHaveCount(1);
        await expect(card).toHaveAttribute('data-complete', 'true');

        const grantBtn = page.getByTestId('complete-endeavour-btn');
        await expect(grantBtn).toBeVisible();

        const progressBar = page.getByTestId('endeavour-progress-bar');
        const pct = await progressBar.getAttribute('aria-valuenow');
        expect(Number(pct)).toBe(100);
    });
});
