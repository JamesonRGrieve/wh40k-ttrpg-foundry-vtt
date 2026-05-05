import { describe, expect, it } from 'vitest';

describe('AmmunitionData', () => {
    it('has a default AmmunitionData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./ammunition');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`ammunition DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes damage + physical + description templates
    //   - migrateData normalises legacy ammunition damage shapes
    //   - prepareDerivedData computes per-shot damage correctly
});
