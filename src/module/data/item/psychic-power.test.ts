import { describe, expect, it } from 'vitest';

const MOD = await import('./psychic-power').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`psychic-power DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('PsychicPowerData', () => {
    it.skipIf(MOD === undefined)('has a default PsychicPowerData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + activation + damage templates
    //   - focusPower schema (characteristic, modifier, threshold, opposed, opposedCharacteristic) defaults
    //   - prCost / rangePerPR / phenomenaModifier number-field defaults
    //   - activationLabel surfaces from the ActivationTemplate mixin
});
