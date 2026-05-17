import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { hasFoundry, requireOrSkip, skipBanner } from './has-foundry';

export const TEST_PORT = Number(process.env.FOUNDRY_TEST_PORT ?? 30001);

export default async function globalSetup(): Promise<void> {
    requireOrSkip('B');
    if (!hasFoundry()) {
        // Playwright still invokes globalSetup even when no specs match.
        // Emit the banner so the run output is unambiguous.
        // eslint-disable-next-line no-console
        console.log(skipBanner('B'));
        return;
    }
    // The setup-foundry-test-world.sh provisioning runs inside webServer.command
    // (so Foundry boots against a populated data dir). Here we just gate
    // until the world is fully ready.
    await waitForWorldReady();
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
 * a Gamemaster option to the client.
 */
async function waitForWorldReady(): Promise<void> {
    const deadline = Date.now() + 180_000;
    const url = `http://127.0.0.1:${TEST_PORT}/systems/wh40k-rpg/system.json`;
    const usersDbDir = resolve(__dirname, '..', '..', '.foundry-test-data', 'Data', 'worlds', 'wh40k-e2e', 'data', 'users');
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
            console.log('[global-setup] Foundry world ready');
            return;
        }
        await new Promise((r) => setTimeout(r, 1_000));
    }
    throw new Error('Foundry world did not become ready within 180s');
}
