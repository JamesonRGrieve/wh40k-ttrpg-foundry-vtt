import type { Page } from '@playwright/test';

/**
 * Base TCP port for the e2e Foundry servers. Worker N talks to its own
 * isolated world on `E2E_PORT_BASE + N` (see {@link e2ePortForWorker}).
 */
const E2E_PORT_BASE = Number(process.env.FOUNDRY_TEST_PORT ?? 30001);

/**
 * The parallel slot for the current worker. Playwright's `TEST_PARALLEL_INDEX`
 * is the stable 0..(workers-1) slot (reused when a worker restarts), unlike
 * `TEST_WORKER_INDEX` which grows monotonically. Defaults to 0 for single-worker
 * runs.
 */
function currentParallelSlot(): number {
    const raw = process.env.TEST_PARALLEL_INDEX;
    const n = raw === undefined ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * The Foundry server port for the current worker — one isolated world+server
 * per parallel slot, so concurrent workers never share a world (no websocket
 * cross-broadcast races).
 */
function e2ePortForWorker(): number {
    return E2E_PORT_BASE + currentParallelSlot();
}

/**
 * Join this worker's own isolated test world as its single auto-created
 * `Gamemaster`. Returns true on success, false if the join select isn't
 * populated (test should skip).
 *
 * This is the single canonical entry point for any Tier B spec that needs to
 * be in /game. Adding a new spec? Use this — do not re-implement the flow.
 * Uses an absolute per-worker base URL rather than the config `baseURL`, since
 * each worker targets a different port.
 */
export async function joinAsGM(page: Page): Promise<boolean> {
    const origin = `http://127.0.0.1:${e2ePortForWorker()}`;
    await page.goto(`${origin}/join`);
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
