import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.STORYBOOK_TEST_PORT ?? 6007);

export default defineConfig({
    testDir: './tests/storybook',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',
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
