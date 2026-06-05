import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('AmmunitionData', () => {
    it('has a default AmmunitionData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./ammunition.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes damage + physical + description templates
    //   - migrateData normalises legacy ammunition damage shapes
    //   - prepareDerivedData computes per-shot damage correctly
});
