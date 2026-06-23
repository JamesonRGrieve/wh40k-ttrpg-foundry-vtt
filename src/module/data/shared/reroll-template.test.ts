import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('RerollTemplate', () => {
    it('has a default RerollTemplate symbol exported', async () => {
        const mod = await importModelOrSkip(import('./reroll-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // The `reroll` SchemaField + `_migrateData` normalizer + `hasReroll` getter
    // need the `foundry.*` globals this mixin evaluates at load, so they can't run
    // under happy-dom. The pure applicability / use-availability logic the engine
    // relies on lives in `src/module/rules/reroll.ts` and is fully unit-tested
    // there (reroll.test.ts); schema construction is exercised by the Tier B suite.
});
