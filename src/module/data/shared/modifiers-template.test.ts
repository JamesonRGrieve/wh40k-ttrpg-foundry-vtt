import { describe, expect, it } from 'vitest';

/**
 * `ModifiersTemplate` extends a Foundry-bound `SystemDataModel`, so it can only
 * be exercised inside the Foundry runtime (mirrors every other
 * DataModel/template test here — e.g. `subtlety-adjuster-template.test.ts`).
 * Under happy-dom the import is deferred and the export shape is asserted.
 */
const MOD = await import('./modifiers-template').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`ModifiersTemplate could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('ModifiersTemplate', () => {
    it.skipIf(MOD === undefined)('exposes a default DataModel export when the Foundry runtime is available', () => {
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: when Foundry runtime is available, add assertions for:
    //   - modifiers array schema (target, value, type) defaults
    //   - the template is mixed into talent / trait / condition / mutation / special-ability items
    //   - active modifier list applies to actor characteristic/skill checks
});
