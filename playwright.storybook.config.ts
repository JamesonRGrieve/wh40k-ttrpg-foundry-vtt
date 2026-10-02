import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.STORYBOOK_TEST_PORT ?? 6007);

// Worker count comes from STORYBOOK_WORKERS, which
// scripts/run-storybook-playwright-tests.sh sizes to the box's current RAM and
// thread headroom (scripts/auto-workers.sh). The fallback of 2 only applies when
// this config is run directly without the wrapper. Pixel suites get flakier
// under load — re-confirm any failure at STORYBOOK_WORKERS=2 before believing it.
const WORKERS = Math.max(1, Number(process.env.STORYBOOK_WORKERS ?? 2));

export default defineConfig({
    testDir: './tests/storybook',
    fullyParallel: true,
    workers: WORKERS,
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
