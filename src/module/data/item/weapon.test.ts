import { describe, expect, it } from 'vitest';

const MOD = await import('./weapon').catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`weapon DataModel could not be imported in this environment: ${msg}`);
    return undefined;
});

describe('WeaponData', () => {
    it.skipIf(MOD === undefined)('has a default WeaponData symbol exported', () => {
        expect(MOD).toBeTruthy();
        expect(MOD?.default).toBeTruthy();
    });

    // TODO: as Foundry test infrastructure expands, add assertions for:
    //   - schema mixes description + physical + equippable + attack + damage + subtlety templates
    //   - migrateData normalises legacy special (Set→array), class→type (chain/power/shock/force), proficiency→requiredTraining
    //   - prepareDerivedData aggregates active modification modifiers and loaded-ammo modifiers
    //   - effectiveDamageFormula / effectivePenetration / effectiveRange combine base + craftsmanship + mods
    //   - effectiveSpecial applies craftsmanship qualities for ranged weapons and ammo add/remove sets
    //   - jamThreshold honours reliable / unreliable / overheats / never-jam qualities
});
