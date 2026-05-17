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
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: 'list',
    timeout: 120_000,
    use: {
        baseURL: `http://127.0.0.1:${PORT}`,
        trace: 'on-first-retry',
        browserName: 'chromium',
        launchOptions: {
            executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    globalSetup: './tests/e2e/global-setup.ts',
    globalTeardown: './tests/e2e/global-teardown.ts',
    webServer: FOUNDRY_PRESENT
        ? {
              command: `${process.env.FOUNDRY_NODE ?? 'node'} .foundry-release/main.js --dataPath=.foundry-release/data-test --port=${PORT} --noupnp --headless`,
              url: `http://127.0.0.1:${PORT}`,
              reuseExistingServer: !process.env.CI,
              timeout: 60_000,
              stdout: 'pipe',
              stderr: 'pipe',
          }
        : undefined,
    projects: [{ name: 'chromium' }],
});
