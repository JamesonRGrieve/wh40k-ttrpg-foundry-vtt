import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('CharacteristicGrantData', () => {
    it('has a default CharacteristicGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./characteristic-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares characteristic + advance fields
    //   - apply() updates target characteristic advances correctly
    //   - migrateData() coerces legacy advance values to integers
});
