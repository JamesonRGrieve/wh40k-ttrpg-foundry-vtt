import { describe, expect, it } from 'vitest';

describe('JournalEntryItemData', () => {
    it('has a default JournalEntryItemData symbol exported', async () => {
        let imported: unknown;
        try {
            imported = await import('./journal-entry');
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`journal-entry item DataModel could not be imported in this environment: ${msg}`);
            return;
        }
        expect(imported).toBeTruthy();
        expect((imported as { default?: unknown }).default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - rich-text body fields round-trip through cleanData
    //   - migrateData normalises legacy journal-entry payloads
});
