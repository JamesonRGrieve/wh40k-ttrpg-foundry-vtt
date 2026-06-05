import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('LocationData', () => {
    it('has a default LocationData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./location.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    it('exposes an ordered locationTypes registry', async () => {
        const mod = await importModelOrSkip(import('./location.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
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
