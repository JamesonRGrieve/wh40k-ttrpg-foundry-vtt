import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('ItemGrantData', () => {
    it('has a default ItemGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./item-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares uuid + quantity fields
    //   - apply() creates the granted item on the target actor
    //   - migrateData() normalises legacy item references
});
