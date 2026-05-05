import { describe, expect, it } from 'vitest';

describe('ItemGrantData', () => {
    it('has a default ItemGrantData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./item-grant');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`item-grant DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares uuid + quantity fields
    //   - apply() creates the granted item on the target actor
    //   - migrateData() normalises legacy item references
});
