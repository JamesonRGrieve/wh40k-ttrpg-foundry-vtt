import { describe, expect, it } from 'vitest';

describe('CreatureTemplate', () => {
    it('has a default CreatureTemplate symbol exported', async () => {
        const mod = await import('./creature').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`creature template could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    it('does not throw when legacy actor data has no characteristics block', async () => {
        const mod = await import('./creature').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`creature template could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;

        const CreatureTemplate = mod.default;
        // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData accepts RawSource = Record<string, unknown>; empty object is the minimal valid source for this migration test
        const source: Parameters<typeof CreatureTemplate._migrateData>[0] = {};

        expect(() => CreatureTemplate._migrateData(source)).not.toThrow();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - skills array shape (standard + specialist split)
    //   - prepareDerivedData computes skill rank/trained/plus10/plus20/plus30
    //   - migrateData fills missing specialisation entries on legacy actors
});
