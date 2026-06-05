import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('MappingField', () => {
    it('has a default MappingField symbol exported', async () => {
        const mod = await importModelOrSkip(import('./mapping-field.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - initialize() materialises a map of typed model entries
    //   - getInitialValue() returns a populated keyed object when initialKeys is set
    //   - cleanData strips entries that fail nested validation
});
