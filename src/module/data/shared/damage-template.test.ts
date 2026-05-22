import { describe, expect, it } from 'vitest';

/**
 * `DamageTemplate` extends a Foundry-bound `SystemDataModel`, so it can only be
 * exercised inside the Foundry runtime (mirrors every other DataModel/template
 * test here — e.g. `subtlety-adjuster-template.test.ts`). Under happy-dom the
 * import is deferred and the export shape is asserted.
 */
const MOD = await import('./damage-template').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`DamageTemplate could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('DamageTemplate', () => {
    it.skipIf(MOD === undefined)('exposes a default DataModel export when the Foundry runtime is available', () => {
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: when Foundry runtime is available, add assertions for:
    //   - damage schema (formula via FormulaField, type, bonus, penetration) defaults
    //   - special SetField round-trips quality identifiers
    //   - damageLabel derived getter composition
});
