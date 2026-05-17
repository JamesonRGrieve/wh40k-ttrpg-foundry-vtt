import { defineConfig } from '@playwright/test';

import { hasFoundryTierB, skipBanner } from './tests/integration/lib/has-foundry';

const PORT = Number(process.env.FOUNDRY_TEST_PORT ?? 30001);
const FOUNDRY_PRESENT = hasFoundryTierB();
const REQUIRED = process.env.FOUNDRY_INTEGRATION === 'required';

if (!FOUNDRY_PRESENT && !REQUIRED) {
    // eslint-disable-next-line no-console
    console.log(skipBanner('B'));
}

export default defineConfig({
    testDir: './tests/e2e',
    // When Foundry is absent and not required, ignore every spec so Playwright
    // exits 0 instead of failing on a missing webServer.
    testIgnore: FOUNDRY_PRESENT || REQUIRED ? [] : ['**/*.spec.ts'],
    // One worker only: the test world auto-creates a single Gamemaster user
    // and Foundry holds that user slot for the active session. Running in
    // parallel would have workers 2+ find no available user on /join.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [['list'], ['json', { outputFile: '.e2e-results.json' }]],
    timeout: 600_000,
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
        browserName: 'chromium',
        // Foundry hard-requires ≥ 1366×768 viewport; default Desktop Chrome
        // (1280×720) triggers a permanent error banner that blocks form
        // hydration.
        viewport: { width: 1440, height: 900 },
        launchOptions: {
            executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    globalSetup: './tests/e2e/global-setup.ts',
    globalTeardown: './tests/e2e/global-teardown.ts',
    webServer: FOUNDRY_PRESENT
        ? {
              // Playwright runs webServer in parallel with globalSetup, so the
              // data dir must be provisioned in this same shell before
              // spawning Foundry. The script is idempotent.
              command: `bash scripts/setup-foundry-test-world.sh && ${process.env.FOUNDRY_NODE ?? 'node'} --require ./scripts/foundry-hostname-shim.cjs .foundry-release/main.js --dataPath=./.foundry-test-data --port=${PORT} --noupnp --headless`,
              url: `http://127.0.0.1:${PORT}`,
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
              stdout: 'pipe',
              stderr: 'pipe',
          }
        : undefined,
    projects: [{ name: 'chromium' }],
});
