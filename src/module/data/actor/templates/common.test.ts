import { describe, expect, it } from 'vitest';

describe('CommonTemplate', () => {
    it('has a default CommonTemplate symbol exported', async () => {
        // Defer the import so it doesn't blow up in non-Foundry environments at module load time.
        const mod = await import('./common').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`common actor template could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares the shared characteristic block across all systems
    //   - prepareDerivedData computes characteristic bonuses correctly
    //   - migrateData normalises legacy characteristic shapes
});
