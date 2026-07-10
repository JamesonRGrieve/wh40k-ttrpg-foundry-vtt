import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('OathData', () => {
    it('has a default OathData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./oath.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    it('is not rollable (an oath is sworn, not rolled)', async () => {
        const mod = await importModelOrSkip(import('./oath.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        // isRollable is a dependency-free getter — invoke it off the prototype
        // without instantiating the DataModel (which needs Foundry globals).
        const descriptor = Object.getOwnPropertyDescriptor(mod.default.prototype, 'isRollable');
        expect(descriptor?.get?.call({})).toBe(false);
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template + identifier/requirement/effect/notes fields
    //   - effect is a required HTML field
});
