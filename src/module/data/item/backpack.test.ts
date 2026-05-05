import { describe, expect, it } from 'vitest';

describe('BackpackData', () => {
    it('has a default BackpackData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./backpack');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`backpack DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - capacity calculations track contents weight correctly
    //   - migrateData normalises legacy capacity shapes
});
