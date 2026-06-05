import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('AttackSpecialData', () => {
    it('has a default AttackSpecialData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./attack-special.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes the description template
    //   - attack special trigger metadata is preserved through migrateData
    //   - prepareDerivedData formats trigger labels for chat output
});
