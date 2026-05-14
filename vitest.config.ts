import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        environment: 'happy-dom',
        globals: true,
        // Per-test timeout. The default 5s is too tight for tests that
        // dynamic-import Foundry-runtime-dependent modules — the import
        // never errors (foundry isn't defined yet, but loading the module
        // chain takes longer than 5s in cold caches under happy-dom).
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/module/**/*.ts'],
            exclude: ['node_modules/**', 'dist/**', '**/*.test.ts', 'src/module/**/_module.ts'],
        },
    },
});
