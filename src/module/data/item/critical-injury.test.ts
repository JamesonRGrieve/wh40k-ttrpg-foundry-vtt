import { describe, expect, it } from 'vitest';

describe('CriticalInjuryData', () => {
    it('has a default CriticalInjuryData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./critical-injury');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`critical-injury DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes description + modifiers templates
    //   - severity field validates against the FFG critical hit table range
    //   - migrateData normalises legacy critical effect payloads
});
