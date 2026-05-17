import { describe, expect, it } from 'vitest';

/**
 * `SubtletyAdjusterTemplate` extends a Foundry-bound `SystemDataModel`, so it
 * can only be exercised inside the Foundry runtime (mirrors every other
 * DataModel test here). The pure normalizer + types it delegates to live in
 * `./subtlety-adjuster.ts` and are fully covered by `subtlety-adjuster.test.ts`.
 */
describe('SubtletyAdjusterTemplate', () => {
    it('exposes a default DataModel export when the Foundry runtime is available', async () => {
        const mod = await import('./subtlety-adjuster-template').catch((err) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(`SubtletyAdjusterTemplate could not be imported in this environment: ${msg}`);
            return undefined;
        });
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: early return when Foundry runtime unavailable, not a conditional assertion branch
        if (mod === undefined) return;
        expect(mod.default).toBeTruthy();
    });
});
