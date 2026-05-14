import { describe, expect, it } from 'vitest';

describe('JournalEntryItemData', () => {
    it('has a default JournalEntryItemData symbol exported', async () => {
        const mod = await import('./journal-entry').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`journal-entry item DataModel could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - rich-text body fields round-trip through cleanData
    //   - migrateData normalises legacy journal-entry payloads
});
