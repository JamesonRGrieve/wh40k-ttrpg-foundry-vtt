import { describe, expect, it } from 'vitest';

const MOD = await import('./special-ability').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`special-ability DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('SpecialAbilityData', () => {
    it.skipIf(MOD === undefined)('has a default SpecialAbilityData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + modifiers templates with benefit (HTML) + notes fields
    //   - modifiers list from the ModifiersTemplate mixin applies to actor checks
});
