/**
 * Storybook regression coverage for issue #187 — Rogue Trader Critical
 * Hit chart on ship hull damage.
 *
 * Background: per RAW (Battlefleet Koronus), when a ship's hull
 * integrity damage triggers a critical hit, the player rolls 1d5 on
 * the Critical Hit chart. The five entries (Vacuum / Fire / Bridge /
 * Drive / Crew) each apply a persistent status to the ship until it is
 * cleared by an Emergency Repair or Quick Repair Extended Action.
 *
 * The runtime fix in `starship-sheet.ts::#rollShipCriticalHit` consults
 * the world `RollTable.getName("Critical Hit")`, then the
 * `rt-core-rolltables-ship-combat` compendium pack, then falls back to
 * a bare 1d5 with the `WH40K.Voidcraft.Critical.TableUnavailable`
 * message — so the player never sees Foundry's "no available results"
 * notification even when the compendium pack is absent. The Critical
 * Hit RollTable JSON itself ships in the `src/packs` submodule at
 * `rogue-trader/rt-core-rolltables-ship-combat/_source/critical-hit_*.json`
 * with 5 weighted result rows covering 1–5.
 *
 * This spec renders the post-roll chat card in Storybook for the
 * Vacuum entry (story id `chat-ship-critical-hit--vacuum`), dumps a
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

test('issue #187: ship critical hit chat card renders the vacuum result', async ({ page }) => {
    // Story id derives from `title: 'Chat/Ship Critical Hit'` plus the
    // `Vacuum` named export, kebab-cased by Storybook.
    await page.goto('/iframe.html?id=chat-ship-critical-hit--vacuum');
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
    await expect(body).toContainText(/Vacuum|Hull Breach/i);

    await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
});

test('issue #187: ship critical hit chat card renders the fallback message', async ({ page }) => {
    await page.goto('/iframe.html?id=chat-ship-critical-hit--table-unavailable-fallback');
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
