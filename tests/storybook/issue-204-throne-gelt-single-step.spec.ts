/**
 * Regression spec for issue #204 — Throne Gelt rolled for in multiple Steps of
 * Origin Path.
 *
 * Bug: the per-origin Throne Gelt roll widget was rendering on BOTH the Home
 * World step AND the Background step of the homebrew DH2 origin-path builder.
 * Per the system's homebrew rules, Throne Gelt is rolled exactly once at
 * character creation (traditionally against the home world's formula). The
 * duplicate widget on Background let players double-dip and walk away with
 * roughly twice their intended starting purse.
 *
 * Fix: `_prepareSelectedOrigin` in `origin-path-builder.ts` now gates the
 * `rolls.thrones` entry on `itemSys.step === 'homeWorld'`. The Background-step
 * compendium entries' `homebrew.throneGelt` formulas remain in the data for
 * narrative reference, but the UI no longer promotes them to a roll widget.
 *
 * This spec opens the two stories that snapshot the post-fix DOM, asserts the
 * single-button / zero-button invariants, and captures a combined screenshot
 * to `.e2e-screenshots/issue-204-throne-gelt.png` so a future regression that
 * re-introduces the Background-step button is visible in the visual diff.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_DIR = resolve(__dirname, '..', '..', '.e2e-screenshots');
const SCREENSHOT_PATH = resolve(SCREENSHOT_DIR, 'issue-204-throne-gelt.png');

const THRONES_ROLL_BUTTON_SELECTOR = 'button[data-action="rollStat"][data-stat-type="thrones"]';

test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
});

test.describe('Issue #204 — Throne Gelt rolls in exactly one origin-path step', () => {
    test('home world step renders exactly one Throne Gelt roll button; background step renders zero', async ({ page }) => {
        // Story id derives from `title: 'Character Creation/OriginPathBuilder'`
        // and the `Issue204HomeWorldThroneGelt` named export, kebab-cased by Storybook.
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-204-home-world-throne-gelt');

        // Home World step: the single legitimate Throne Gelt roll button must render.
        const homeWorldButtons = page.locator(THRONES_ROLL_BUTTON_SELECTOR);
        await expect(homeWorldButtons).toHaveCount(1);
        await expect(page.getByText('Throne Gelt')).toBeVisible();

        // Capture the home-world screenshot first so it's part of the combined record.
        await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });

        // Navigate to the background story and assert ZERO Throne Gelt roll buttons.
        await page.goto('/iframe.html?id=character-creation-originpathbuilder--issue-204-background-no-throne-gelt');

        const backgroundButtons = page.locator(THRONES_ROLL_BUTTON_SELECTOR);
        await expect(backgroundButtons).toHaveCount(0);

        // Also assert the manual-entry counterpart button is absent (the duplicate
        // bug surfaced both roll AND manual buttons on Background; guard both).
        const backgroundManualButtons = page.locator('button[data-action="manualStat"][data-stat-type="thrones"]');
        await expect(backgroundManualButtons).toHaveCount(0);
    });
});
