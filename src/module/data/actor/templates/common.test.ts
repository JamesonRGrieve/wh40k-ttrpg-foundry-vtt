import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../../testing/model-import.ts';

describe('CommonTemplate', () => {
    it('has a default CommonTemplate symbol exported', async () => {
        const mod = await importModelOrSkip(import('./common.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema declares the shared characteristic block across all systems
    //   - prepareDerivedData computes characteristic bonuses correctly
    //   - migrateData normalises legacy characteristic shapes
});
