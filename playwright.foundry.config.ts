import { defineConfig } from '@playwright/test';

import { hasFoundryTierB, skipBanner } from './tests/integration/lib/has-foundry';

const PORT = Number(process.env.FOUNDRY_TEST_PORT ?? 30001);
const FOUNDRY_PRESENT = hasFoundryTierB();
const REQUIRED = process.env.FOUNDRY_INTEGRATION === 'required';

// Worker count = number of fully-isolated worlds. Each worker gets its OWN
// Foundry server+world on port (PORT + workerIndex) with its own data dir
// `.foundry-test-data-<port>`, so concurrent workers never share a world and
// the V14 websocket never cross-broadcasts one worker's mutations into another
// worker's page (the shared-world race). 1 ⇒ serial. run-e2e.sh sets this to 1
// for targeted runs and to the box's chosen fan-out for full runs.
const WORKERS = Math.max(1, Number(process.env.E2E_WORKERS ?? 1));
const FOUNDRY_NODE = process.env.FOUNDRY_NODE ?? 'node';

// One webServer per worker: provision its isolated data dir (idempotent), then
// boot Foundry against it. Playwright starts all concurrently and waits for
// every `url` before running specs. join.ts targets the matching port by
// TEST_PARALLEL_INDEX.
const webServers = FOUNDRY_PRESENT
    ? Array.from({ length: WORKERS }, (_, i) => {
          const port = PORT + i;
          return {
              command: `bash scripts/setup-foundry-test-world.sh ${port} && ${FOUNDRY_NODE} --require ./scripts/foundry-hostname-shim.cjs .foundry-release/main.js --dataPath=./.foundry-test-data-${port} --port=${port} --noupnp --headless`,
              url: `http://127.0.0.1:${port}`,
              reuseExistingServer: !process.env.CI,
              timeout: 180_000,
              stdout: 'pipe' as const,
              stderr: 'pipe' as const,
          };
      })
    : undefined;

if (!FOUNDRY_PRESENT && !REQUIRED) {
    // eslint-disable-next-line no-console
    console.log(skipBanner('B'));
}

export default defineConfig({
    testDir: './tests/e2e',
    // When Foundry is absent and not required, ignore every spec so Playwright
    // exits 0 instead of failing on a missing webServer.
    testIgnore: FOUNDRY_PRESENT || REQUIRED ? [] : ['**/*.spec.ts'],
    // Parallelism is opt-in via E2E_WORKERS (default 1 = serial). With N>1,
    // fullyParallel spreads even same-file tests across the N isolated worlds.
    workers: WORKERS,
    fullyParallel: WORKERS > 1,
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
            // GPU acceleration (default ON; set E2E_GPU=0 to force software):
            // render Foundry's PIXI canvas on the host GPU via ANGLE-on-Vulkan
            // instead of software SwiftShader, which otherwise burns ~10 CPU
            // cores per worker. Validated: a 4-worker run dropped CPU load from
            // ~41 to ~14 and finished ~2x faster (15.6m vs 30m) with no
            // regressions. The angle-vulkan backend is the only one that reaches
            // the NVIDIA device headlessly here; on a GPU-less box chromium
            // falls back to SwiftShader automatically, so this stays safe in CI.
            args: [
                '--no-sandbox',
                '--disable-dev-shm-usage',
                ...(process.env.E2E_GPU !== '0'
                    ? ['--ignore-gpu-blocklist', '--enable-features=Vulkan', '--use-gl=angle', '--use-angle=vulkan', '--enable-gpu-rasterization']
                    : []),
            ],
        },
    },
    globalSetup: './tests/e2e/global-setup.ts',
    globalTeardown: './tests/e2e/global-teardown.ts',
    webServer: webServers,
    projects: [{ name: 'all' }],
});
