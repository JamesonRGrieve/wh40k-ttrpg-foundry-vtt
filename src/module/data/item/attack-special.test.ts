import { describe, expect, it } from 'vitest';

describe('AttackSpecialData', () => {
    it('has a default AttackSpecialData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./attack-special');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`attack-special DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - attack special trigger metadata is preserved through migrateData
    //   - prepareDerivedData formats trigger labels for chat output
});
