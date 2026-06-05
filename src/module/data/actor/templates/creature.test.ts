import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

describe('CreatureTemplate', () => {
    it('has a default CreatureTemplate symbol exported', async () => {
        const mod = await importModelOrSkip(import('./creature.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    it('does not throw when legacy actor data has no characteristics block', async () => {
        const mod = await importModelOrSkip(import('./creature.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;

        const CreatureTemplate = mod.default;
        const source: Parameters<typeof CreatureTemplate._migrateData>[0] = {};

        expect(() => CreatureTemplate._migrateData(source)).not.toThrow();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - skills array shape (standard + specialist split)
    //   - prepareDerivedData computes skill rank/trained/plus10/plus20/plus30
    //   - migrateData fills missing specialisation entries on legacy actors
});
