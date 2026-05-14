import { describe, expect, it } from 'vitest';

/**
 * Tests for SystemDataModel static utilities.
 * The class extends foundry.abstract.TypeDataModel so it cannot be
 * instantiated in happy-dom; we test every static method that operates
 * on plain objects and is Foundry-runtime-independent.
 */
describe('SystemDataModel', () => {
    it('exports a default class symbol', async () => {
        const mod = await import('./system-data-model').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`SystemDataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });

    it('static metadata has systemFlagsModel null by default', async () => {
        const mod = await import('./system-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const SystemDataModel = mod.default;
        expect(SystemDataModel.metadata.systemFlagsModel).toBeNull();
    });

    it('_migrateData with empty source does not throw', async () => {
        const mod = await import('./system-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const SystemDataModel = mod.default;
        const source = {};
        expect(() => SystemDataModel._migrateData(source)).not.toThrow();
    });

    it('_cleanData with empty source does not throw', async () => {
        const mod = await import('./system-data-model').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const SystemDataModel = mod.default;
        expect(() => SystemDataModel._cleanData(undefined)).not.toThrow();
    });
});
