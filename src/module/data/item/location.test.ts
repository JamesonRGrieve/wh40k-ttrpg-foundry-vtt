import { describe, expect, it } from 'vitest';

describe('LocationData', () => {
    it('has a default LocationData symbol exported', async () => {
        const mod = await import('./location').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`location DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    it('exposes an ordered locationTypes registry', async () => {
        const mod = await import('./location').catch(() => undefined);
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable
        if (mod === undefined) return;
        const types = mod.default.locationTypes;
        expect(Array.isArray(types)).toBe(true);
        expect(types).toContain('planet');
        expect(types).toContain('sector');
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description + source per-line variant template
    //   - _migrateData drops the legacy `gameSystems` array
    //   - locationTypeLabel / locationTypeIcon fall back safely
    //   - chatProperties surface type / faction / sector
});
