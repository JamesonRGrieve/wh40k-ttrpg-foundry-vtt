/**
 * Issue #234 — the compact movement panel (movement-panel-compact.hbs) is now
 * wired into the combat-station-panel in place of the old inline mobility block.
 * This renders the panel story and dumps a PNG to .e2e-screenshots for visual
 * inspection, and asserts the four movement rows render with their values.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SHOT_DIR = resolve(__dirname, '..', '..', '.e2e-screenshots');
const SHOT = resolve(SHOT_DIR, 'issue-234-movement-compact.png');

test('issue #234/#235: compact movement cluster renders Half/Full/Charge/Run/Disengage', async ({ page }) => {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.goto('/iframe.html?id=actor-character-movementpanelcompact--out-of-combat&viewMode=story');
    await page.waitForSelector('.wh40k-panel', { timeout: 10_000 });
    await page.screenshot({ path: SHOT, fullPage: true });

    // Labels are CSS-uppercased; compare case-insensitively.
    const text = (await page.locator('.wh40k-panel').innerText()).replace(/\s+/g, ' ').toUpperCase();
    for (const label of ['HALF', 'FULL', 'CHARGE', 'RUN', 'DISENGAGE']) {
        expect(text).toContain(label);
    }
    // The four rates from the story args (4 / 8 / 12 / 24 m).
    for (const value of ['4M', '8M', '12M', '24M']) {
        expect(text).toContain(value);
    }
});
