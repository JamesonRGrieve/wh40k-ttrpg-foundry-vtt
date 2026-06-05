import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('JournalEntryItemData', () => {
    it('has a default JournalEntryItemData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./journal-entry.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - rich-text body fields round-trip through cleanData
    //   - migrateData normalises legacy journal-entry payloads
});
