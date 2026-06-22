import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { hasFoundry, requireOrSkip, skipBanner } from './has-foundry';

// Base port for the per-worker isolated worlds — kept in sync with join.ts's
// E2E_PORT_BASE (worker N → port base+N). Computed locally so this string-loaded
// Playwright globalSetup carries no module import knip can't trace.
const E2E_PORT_BASE = Number(process.env.FOUNDRY_TEST_PORT ?? 30001);

/** Number of isolated worlds/workers — one Foundry server+world+port each, so
 *  concurrent workers never share a world (no websocket cross-broadcast races).
 *  Keep in sync with playwright.foundry.config.ts. */
const E2E_WORKERS = Math.max(1, Number(process.env.E2E_WORKERS ?? 1));

export default async function globalSetup(): Promise<void> {
    requireOrSkip('B');
    if (!hasFoundry()) {
        // Playwright still invokes globalSetup even when no specs match.
        // Emit the banner so the run output is unambiguous.
        // eslint-disable-next-line no-console
        console.log(skipBanner('B'));
        return;
    }
    // Each worker has its own Foundry server+world, provisioned and booted by the
    // matching webServer entry in playwright.foundry.config.ts. Gate until every
    // world is fully ready before any spec runs.
    await Promise.all(Array.from({ length: E2E_WORKERS }, async (_, i) => waitForWorldReady(E2E_PORT_BASE + i)));
}

/**
 * Foundry's HTTP server starts serving /systems/<id>/system.json early in the
 * boot pipeline — well before world setup completes and the Gamemaster user
 * is auto-created. To gate reliably, poll for the post-setup artifacts:
 *   1. /systems/wh40k-rpg/system.json serves 200 (server accepts traffic).
 *   2. worlds/wh40k-e2e/data/users.db/ directory exists with LevelDB files
 *      (auto-created when World#setup() runs World#d() — the GM bootstrap).
 *
 * Both conditions must hold; the second is what guarantees /join will render
 * a Gamemaster option to the client. One data dir per port: `.foundry-test-data-<port>`.
 */
async function waitForWorldReady(port: number): Promise<void> {
    const deadline = Date.now() + 180_000;
    const url = `http://127.0.0.1:${port}/systems/wh40k-rpg/system.json`;
    const usersDbDir = resolve(__dirname, '..', '..', `.foundry-test-data-${port}`, 'Data', 'worlds', 'wh40k-e2e', 'data', 'users');
    while (Date.now() < deadline) {
        let httpOk = false;
        try {
            const res = await fetch(url);
            httpOk = res.ok;
        } catch {
            // server not up yet
        }
        if (httpOk && existsSync(usersDbDir) && readdirSync(usersDbDir).length > 0) {
            // eslint-disable-next-line no-console
            console.log(`[global-setup] Foundry world ready on :${port}`);
            return;
        }
        await new Promise((r) => {
            setTimeout(r, 1_000);
        });
    }
    throw new Error(`Foundry world on :${port} did not become ready within 180s`);
}
