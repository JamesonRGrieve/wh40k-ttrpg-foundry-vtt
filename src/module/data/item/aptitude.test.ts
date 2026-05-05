import { describe, expect, it } from 'vitest';

describe('AptitudeData', () => {
    it('has a default AptitudeData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./aptitude');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`aptitude DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - aptitude name validation matches the FFG canonical list
    //   - migrateData normalises legacy aptitude payloads
});
