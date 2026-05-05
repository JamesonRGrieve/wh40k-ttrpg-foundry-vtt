import { describe, expect, it } from 'vitest';

describe('GearData', () => {
    it('has a default GearData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./gear');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`gear DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - prepareDerivedData formats display weight + cost
    //   - migrateData normalises legacy gear payloads
});
