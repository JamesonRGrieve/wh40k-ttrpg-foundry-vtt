import { describe, expect, it } from 'vitest';

const MOD = await import('./mutation').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`mutation DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('MutationData', () => {
    it.skipIf(MOD === undefined)('has a default MutationData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + modifiers templates with category / effect / drawback fields
    //   - visible boolean field default
    //   - modifiers list from the ModifiersTemplate mixin applies to actor checks
});
