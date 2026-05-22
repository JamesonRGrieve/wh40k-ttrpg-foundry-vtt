import { describe, expect, it } from 'vitest';

const MOD = await import('./ritual').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`ritual DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('RitualData', () => {
    it.skipIf(MOD === undefined)('has a default RitualData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + activation templates with type default 'prayer'
    //   - type choices (prayer / rite / invocation / ceremony / tech-rite)
    //   - test schema (characteristic, skill, modifier, threshold) defaults
    //   - activationLabel surfaces from the ActivationTemplate mixin
});
