import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * `SubtletyAdjusterTemplate` extends a Foundry-bound `SystemDataModel`, so it
 * can only be exercised inside the Foundry runtime (mirrors every other
 * DataModel test here). The pure normalizer + types it delegates to live in
 * `./subtlety-adjuster.ts` and are fully covered by `subtlety-adjuster.test.ts`.
 */
describe('SubtletyAdjusterTemplate', () => {
    it('exposes a default DataModel export when the Foundry runtime is available', async () => {
        const mod = await importModelOrSkip(import('./subtlety-adjuster-template.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });
});
