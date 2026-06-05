import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('ConditionData', () => {
    it('has a default ConditionData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./condition.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema includes description + modifiers templates
    //   - active modifier list applies to actor characteristic checks
    //   - migrateData normalises legacy condition payloads
});
