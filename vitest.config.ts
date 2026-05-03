import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
        exclude: ['node_modules/**', 'dist/**'],
        environment: 'happy-dom',
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/module/**/*.ts'],
            exclude: ['node_modules/**', 'dist/**', '**/*.test.ts', 'src/module/**/_module.ts'],
        },
    },
});
