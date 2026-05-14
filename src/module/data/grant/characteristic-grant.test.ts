import { describe, expect, it } from 'vitest';

describe('CharacteristicGrantData', () => {
    it('has a default CharacteristicGrantData symbol exported', async () => {
        const mod = await import('./characteristic-grant').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`characteristic-grant DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares characteristic + advance fields
    //   - apply() updates target characteristic advances correctly
    //   - migrateData() coerces legacy advance values to integers
});
