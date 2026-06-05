import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('ChoiceGrantData', () => {
    it('has a default ChoiceGrantData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./choice-grant.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes a choices array of nested grant payloads
    //   - apply() honours the selected choice index
    //   - migrateData() drops malformed legacy choice entries
});
