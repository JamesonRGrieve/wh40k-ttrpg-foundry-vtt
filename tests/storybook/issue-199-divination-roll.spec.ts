/**
 * Storybook regression coverage for issue #199 — rolling for Divination
 * in the Origin Path Characteristics step.
 *
 * Background: the original bug surfaced as Foundry's "There are no
 * available results which can be drawn from this table." notification
 * because the Divination compendium RollTable was missing. The fix in
 * `origin-path-builder.ts::#rollDivination` checks the world tables
 * collection, then the `dh2-core-rolltables` pack, then falls back to
 * a bare 1d100 with the `WH40K.OriginPath.DivinationTableUnavailable`
 * message. The Divination table JSON itself lives in the `src/packs`
 * submodule and ships 22 weighted result rows covering 1–100.
 *
 * This spec exercises the Divination section's *post-roll* render
 * state in Storybook — i.e. the same DOM the player sees once the
 * dice button has been clicked and `#rollDivination` has populated
 * `_divination`. It dumps a full-page PNG to
 * `.e2e-screenshots/issue-199-divination.png` for visual inspection
 * and asserts the rendered result text is non-empty.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_PATH = resolve(__dirname, '..', '..', '.e2e-screenshots', 'issue-199-divination.png');

test.beforeAll(() => {
    // Ensure the screenshots directory exists before the page tries to
    // dump into it; mkdirSync with recursive is a no-op if it already
    // exists.
    mkdirSync(resolve(__dirname, '..', '..', '.e2e-screenshots'), { recursive: true });
});

test('issue #199: divination section renders a non-empty roll result', async ({ page }) => {
    // Story id derives from `title: 'Character Creation/Divination Section Issue 199'`
    // and the `Rolled` named export, kebab-cased by Storybook.
    await page.goto('/iframe.html?id=character-creation-divination-section-issue-199--rolled');

    const input = page.locator('input.csd-divination-input');
    await expect(input).toBeVisible();

    // The Rolled story seeds the input with a real DH2 RAW Table 2-9
    // result. The regression we are guarding against is the section
    // showing an empty value or the upstream "no available results"
    // string. Assert non-empty + assert no Foundry warning text leaked.
    const value = await input.inputValue();
    expect(value.length).toBeGreaterThan(0);
    expect(value).not.toContain('no available results which can be drawn');

    // The dice button keeps the `data-action="rollDivination"` handle
    // the runtime sheet's static actions table reads. If a refactor
    // breaks the handle, this assertion catches it before the user
    // does.
    await expect(page.locator('[data-action="rollDivination"]')).toBeVisible();

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
});

test('issue #199: divination section renders the table-unavailable fallback message', async ({ page }) => {
    await page.goto('/iframe.html?id=character-creation-divination-section-issue-199--table-unavailable-fallback');

    const input = page.locator('input.csd-divination-input');
    await expect(input).toBeVisible();

    // The fallback message format must include the rolled value and
    // tell the player to fill the maxim in by hand. If the format
    // string in `en.json` is renamed or the call site drops it, this
    // assertion fails.
    const value = await input.inputValue();
    expect(value).toContain('1d100');
    expect(value).toMatch(/by hand/i);
});
