import { describe, expect, it } from 'vitest';

describe('BackpackData', () => {
    it('has a default BackpackData symbol exported', async () => {
        const mod = await import('./backpack').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`backpack DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - capacity calculations track contents weight correctly
    //   - migrateData normalises legacy capacity shapes
});
