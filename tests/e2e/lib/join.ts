import type { Page } from '@playwright/test';
import { test } from './test';

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
/**
 * One attempt to reach /join and confirm the world's user list is populated.
 * `backoff` inserts a short wait first (used on retries) to let a slow world boot
 * catch up. Returns true when the Gamemaster <option> is attached.
 */
/** Per-attempt wait for the user <select> to populate. */
const JOIN_ATTEMPT_TIMEOUT_MS = 20_000;

async function joinSelectPopulated(page: Page, origin: string, backoff: boolean): Promise<boolean> {
    if (backoff) await page.waitForTimeout(2_000);
    await page.goto(`${origin}/join`);
    await page.waitForLoadState('networkidle');
    try {
        await page.locator('select[name="userid"] option', { hasText: /\S/ }).first().waitFor({ state: 'attached', timeout: JOIN_ATTEMPT_TIMEOUT_MS });
        return true;
    } catch {
        return false;
    }
}

export async function joinAsGM(page: Page): Promise<boolean> {
    const origin = `http://127.0.0.1:${e2ePortForWorker()}`;
    // The first spec to reach /join can beat the world's boot: the user list
    // (the Gamemaster <option>) isn't populated until the world finishes loading.
    // A single wait then races that startup and fails intermittently — which, for
    // the coverage-tracker spec (_aa_inventory), corrupts the whole run's coverage,
    // and elsewhere skips otherwise-green specs. Retry with reloads so a slow boot
    // is tolerated rather than fatal. The world boot loads a per-world copy of every
    // compendium pack (LevelDB single-process lock), so the FIRST spec's cold boot
    // under simultaneous multi-worker startup can take well over a minute; budget
    // ~180s total (≈ the webServer readiness timeout). Warm joins early-exit on the
    // first attempt, so only a genuine cold boot / failure pays the full budget.
    const JOIN_ATTEMPTS = 8;
    // The ready wait needs its own retry, for a DIFFERENT reason than the loop
    // above. Phase one buys time for the user list; `game.ready` is a separate
    // phase, and on the first client to join a fresh server process it does not
    // merely run slow — it never arrives. Raising the cap from 60s to 180s was
    // measured: the wait consumed the whole 180s and still failed, so this is a
    // wedged client boot, not a slow one. A page reload clears it (which is why
    // the SECOND spec in a run always joins fine — a later spec arrives on a new
    // page), so retry with reloads and keep the total budget where it was.
    //
    // Left unfixed this is a trap, not just a flake: in a full run `_aa_inventory`
    // sorts first and absorbs the wedge, so the suite looks green, while ANY
    // targeted subset fails on whichever spec happens to sort first — presenting
    // as a product regression in an arbitrary spec. It cost a long bisect proving
    // an unrelated refactor innocent, because the failure MOVES when you change
    // which specs you run.
    const READY_ATTEMPTS = 3;
    const READY_TIMEOUT_MS = 60_000;
    let populated = false;
    for (let attempt = 0; attempt < JOIN_ATTEMPTS; attempt++) {
        // eslint-disable-next-line no-await-in-loop -- sequential retry: each attempt must fully resolve (and fail) before the next reload; parallelizing defeats the world-boot backoff
        populated = await joinSelectPopulated(page, origin, attempt > 0);
        if (populated) break;
    }
    if (!populated) return false;
    await page.selectOption('select[name="userid"]', { label: 'Gamemaster' });
    await page.click('button[name="join"]');
    await page.waitForURL(/\/game/, { timeout: 30_000 });
    let ready = false;
    for (let attempt = 0; attempt < READY_ATTEMPTS; attempt++) {
        try {
            // eslint-disable-next-line no-await-in-loop -- sequential retry: the reload below must not race a still-pending ready wait
            await page.waitForFunction(
                () =>
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime global `game` is injected by the licensed app; no shipped types
                    (globalThis as unknown as { game?: { ready?: boolean } }).game?.ready === true,
                undefined,
                { timeout: READY_TIMEOUT_MS },
            );
            ready = true;
            break;
        } catch {
            // Reload straight back into /game — the session cookie re-joins as the
            // same user, so this is a fresh client boot rather than a fresh join.
            if (attempt < READY_ATTEMPTS - 1) {
                // eslint-disable-next-line no-await-in-loop -- sequential retry: see above
                await page.reload({ waitUntil: 'domcontentloaded' });
            }
        }
    }
    if (!ready) return false;
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
 * Join the seed world as the Gamemaster, or skip the current test when the join
 * did not succeed (the transient join race documented on {@link joinAsGM}). This
 * collapses the `const joined = await joinAsGM(page); test.skip(!joined, …)`
 * pair that opened nearly every Tier B test into one call.
 */
export async function joinOrSkip(page: Page, reason = 'GM join failed'): Promise<void> {
    const joined = await joinAsGM(page);
    test.skip(!joined, reason);
}

/**
 * The 7 game systems this codebase homologates. Tier B specs that exercise
 * actor/item behavior iterate this list to cover all of them in one pass.
 */
export const GAME_SYSTEM_IDS = ['bc', 'dh1', 'dh2', 'dw', 'ow', 'rt', 'im'] as const;
export type GameSystemId = (typeof GAME_SYSTEM_IDS)[number];
