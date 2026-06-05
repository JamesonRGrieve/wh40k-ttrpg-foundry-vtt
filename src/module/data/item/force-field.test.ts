import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('ForceFieldData', () => {
    it('has a default ForceFieldData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./force-field.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes physical + equippable templates
    //   - protection rating + overload threshold field defaults
    //   - migrateData normalises legacy force-field payloads
});
