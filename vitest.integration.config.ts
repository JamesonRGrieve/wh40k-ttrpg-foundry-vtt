import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/integration/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**', 'tests/integration/lib/**'],
        environment: 'jsdom',
        globals: true,
        testTimeout: 60_000,
        hookTimeout: 60_000,
        globalSetup: ['tests/integration/lib/boot.ts'],
    },
});
