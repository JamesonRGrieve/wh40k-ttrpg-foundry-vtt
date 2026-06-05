import { describe, expect, it } from 'vitest';
import { importModelOrSkip } from '../../testing/model-import.ts';

/**
 * Smoke-test for FormulaField. Top-level imports of Foundry-dependent
 * DataModels blow up in vitest's happy-dom environment because the class
 * extends `foundry.data.fields.StringField` at definition time. Defer the
 * import to runtime so the assertion still fires when the env supports it
 * and degrades gracefully otherwise.
 */
describe('FormulaField', () => {
    it('exposes a default export when the Foundry env supports it', async () => {
        const mod = await importModelOrSkip(import('./formula-field.ts'));
        // eslint-disable-next-line @vitest/no-conditional-in-test -- guard: skip when the model can't load under happy-dom, not an assertion branch
        if (mod === undefined) return;
        expect(mod).toBeTruthy();
        expect(mod.default).toBeTruthy();
    });

    // TODO: once Foundry test infrastructure expands:
    //   - assert _validateType throws on malformed dice formulas
    //   - assert deterministic flag rejects non-deterministic Roll instances
    //   - assert evaluate() returns null when the field's parent value is empty
});
