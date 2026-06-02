/**
 * Issue #238 — the Specialist Skills and Talents panels on the Statistics tab now
 * route through the shared panel.hbs header, so their heading matches the
 * Characteristics / Skills / Traits panels. Dumps a PNG for visual comparison and
 * asserts both panels render the shared header structure with their labels.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SHOT_DIR = resolve(__dirname, '..', '..', '.e2e-screenshots');
const SHOT = resolve(SHOT_DIR, 'issue-238-stats-headings.png');

test('issue #238: specialist + talent panels share the panel.hbs header', async ({ page }) => {
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.goto('/iframe.html?id=actor-character-statstabheadings--unified-headers&viewMode=story');
    await page.waitForSelector('.wh40k-panel-header', { timeout: 10_000 });
    await page.screenshot({ path: SHOT, fullPage: true });

    // Both panels must use the shared header (.wh40k-panel-header > .wh40k-panel-title).
    const titles = await page.locator('.wh40k-panel-header .wh40k-panel-title').allInnerTexts();
    const joined = titles.join(' | ').toLowerCase();
    expect(joined).toContain('specialist');
    expect(joined).toContain('talents');
    expect(titles.length).toBeGreaterThanOrEqual(2);
});
