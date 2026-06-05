import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('ResourceGrantData', () => {
    it('has a default ResourceGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./resource-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares resource key + amount fields
    //   - apply() increments the named resource on the target actor
    //   - migrateData() coerces legacy amount strings to numbers
});
