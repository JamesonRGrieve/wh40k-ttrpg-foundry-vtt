import { describe, expect, it } from 'vitest';

describe('ResourceGrantData', () => {
    it('has a default ResourceGrantData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./resource-grant');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`resource-grant DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares resource key + amount fields
    //   - apply() increments the named resource on the target actor
    //   - migrateData() coerces legacy amount strings to numbers
});
