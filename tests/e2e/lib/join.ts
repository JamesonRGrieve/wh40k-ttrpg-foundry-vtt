import type { Page } from '@playwright/test';

/**
 * Join the test world as the auto-created Gamemaster user. Returns true on
 * success, false if the join select isn't populated (test should skip).
 *
 * This is the single canonical entry point for any Tier B spec that needs to
 * be in /game. Adding a new spec? Use this — do not re-implement the flow.
 */
export async function joinAsGM(page: Page): Promise<boolean> {
    await page.goto('/join');
    await page.waitForLoadState('networkidle');
    try {
        await page.locator('select[name="userid"] option', { hasText: /\S/ }).first().waitFor({ state: 'attached', timeout: 30_000 });
    } catch {
        return false;
    }
    await page.selectOption('select[name="userid"]', { label: 'Gamemaster' });
    await page.click('button[name="join"]');
    await page.waitForURL(/\/game/, { timeout: 30_000 });
    await page.waitForFunction(
        () =>
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global `game` is injected by the licensed app; no shipped types
            (globalThis as unknown as { game?: { ready?: boolean } }).game?.ready === true,
        undefined,
        { timeout: 60_000 },
    );
    // Disable the "build your unfinished character" sheet-open prompt so its
    // modal dialog never overlays sheets that other specs render/screenshot.
    // (Specs that exercise the prompt itself re-enable it explicitly.)
    await page.evaluate(async () => {
        try {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game.settings` is injected by the licensed app; no shipped types
            const g = globalThis as unknown as { game?: { settings?: { set?: (s: string, k: string, v: boolean) => Promise<unknown> } } };
            await g.game?.settings?.set?.('wh40k-rpg', 'prompt-incomplete-origin-path', false);
        } catch {
            /* setting not registered (older build) — non-fatal */
        }
    });
    return true;
}

/**
 * The 7 game systems this codebase homologates. Tier B specs that exercise
 * actor/item behavior iterate this list to cover all of them in one pass.
 */
export const GAME_SYSTEM_IDS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const;
export type GameSystemId = (typeof GAME_SYSTEM_IDS)[number];
