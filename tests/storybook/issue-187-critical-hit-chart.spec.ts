/**
 * Storybook regression coverage for issue #187 — Rogue Trader Critical
 * Hit chart on ship hull damage.
 *
 * Background: per RAW (RT Core, "Starship Weapons"), a weapon's Critical
 * Hit rolls 1d5 on the Critical Hit chart (Table 8-12): Holed, Internal
 * Damage, Sensors Damaged, Thrusters Damaged, Fire!. Each applies a
 * persistent status to the ship until it is repaired.
 *
 * `WH40KVoidcraft.rollShipCriticalHit` draws the 1d5 result from the world
 * `RollTable` "Ship Critical Hits", then the `rt-core-rolltables`
 * compendium pack (in the `src/packs-private` submodule at
 * `rogue-trader/rt-core-rolltables/_source/ship-critical-hits_RTshipCrit221.json`),
 * and only when neither exists posts the
 * `WH40K.Voidcraft.Critical.TableUnavailable` message.
 *
 * This spec renders the post-roll chat card in Storybook for the
 * Holed entry (story id `dev-chat-ship-critical-hit--holed`), dumps a
 * full-page PNG to `.e2e-screenshots/issue-187-critical-hit.png` for
 * visual inspection, and asserts the rendered body is attached. The
 * assertion is lenient on structured selectors — the goal is a
 * regression guard against the entire post-roll surface vanishing or
 * throwing during render.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const SCREENSHOT_PATH = resolve(__dirname, '..', '..', '.e2e-screenshots', 'issue-187-critical-hit.png');

test.beforeAll(() => {
    // Ensure the screenshots directory exists before the page tries to
    // dump into it; mkdirSync with recursive is a no-op if it already
    // exists.
    mkdirSync(resolve(__dirname, '..', '..', '.e2e-screenshots'), { recursive: true });
});

test('issue #187: ship critical hit chat card renders the Holed result', async ({ page }) => {
    // Story id derives from `title: 'Chat/Ship Critical Hit'` plus the
    // `Holed` named export, kebab-cased by Storybook.
    await page.goto('/iframe.html?id=dev-chat-ship-critical-hit--holed');
    await page.waitForLoadState('networkidle');

    // Lenient selector: the body element should be attached and contain
    // something — we don't pin to a specific class chain because the
    // shared chat-card shell partial may evolve.
    const body = page.locator('body');
    await expect(body).toBeAttached();

    // The card text should mention the rolled entry. Use a web-first
    // assertion (auto-retries until the story iframe finishes rendering)
    // rather than a one-shot textContent() read, which races the mount
    // under heavy parallel load. We don't require an exact match because
    // the partial wraps content in nested elements with extra whitespace.
    await expect(body).toContainText(/Holed/);

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
});

test('issue #187: ship critical hit chat card renders the fallback message', async ({ page }) => {
    await page.goto('/iframe.html?id=dev-chat-ship-critical-hit--table-unavailable-fallback');
    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).toBeAttached();

    // The fallback story uses the `TableUnavailable` format string; if
    // the format key is dropped or renamed, these assertions catch it.
    // Web-first assertions auto-retry until the card mounts (avoids the
    // textContent() render race seen under parallel pre-commit load).
    await expect(body).toContainText(/rolled 1 on 1d5/i);
    await expect(body).toContainText(/by hand/i);
});
