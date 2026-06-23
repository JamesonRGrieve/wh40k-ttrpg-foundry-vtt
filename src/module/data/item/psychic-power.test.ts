import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

describe('PsychicPowerData', () => {
    it('has a default PsychicPowerData symbol exported', async () => {
        const mod = await importModelOrSkip(import('./psychic-power.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // `_migrateData` discipline coercion (title-case → lowercase choice, unknown
    // → 'minor') needs the `foundry.*` globals this model evaluates at load, so it
    // can't run under happy-dom. Its real regression coverage lives in the Tier B
    // e2e suite: tests/e2e/item-corruption-resilience.spec.ts.
});
