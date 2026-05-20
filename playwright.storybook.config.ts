import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.STORYBOOK_TEST_PORT ?? 6007);

export default defineConfig({
    testDir: './tests/storybook',
    fullyParallel: true,
    // Cap workers at 2 — this suite runs from the pre-commit pipeline alongside
    // ~20 other CPU-heavy ratchets (3 tsc passes, type-coverage, knip, deps,
    // eslint, biome, vitest, …). With the default 50%-of-cores fanout, screenshot
    // capture starves and `toHaveScreenshot`'s 5s budget expires across dozens of
    // stories. 2 keeps the suite stable under contention; total runtime stays
    // within the pre-commit envelope.
    workers: 2,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',
    expect: {
        // Default 5s is too tight when the storybook suite shares CPU with the
        // rest of the pre-commit fanout — page-load + image-stability under
        // contention can run past it for big stories. 15s is a generous cap
        // that still keeps a hung test from blocking the whole pipeline.
        toHaveScreenshot: { timeout: 15_000 },
    },
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        trace: 'on-first-retry',
        browserName: 'chromium',
        launchOptions: {
            executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
            args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
    },
    webServer: {
        command: `python3 -m http.server ${port} --bind 127.0.0.1 --directory storybook-static`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: !process.env.CI,
        stdout: 'ignore',
        stderr: 'pipe',
    },
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
            },
        },
    ],
});
