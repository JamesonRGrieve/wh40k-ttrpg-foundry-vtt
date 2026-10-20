import { describe, expect, it } from 'vitest';
import { emptyAggregatedVehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';
import { signedModifier, vehicleTraitRuleRows } from './vehicle-trait-rules.ts';

describe('vehicleTraitRuleRows (Trait Rules panel, content#28)', () => {
    it('is empty for a craft whose traits give no movement, terrain or deployment rules', () => {
        expect(vehicleTraitRuleRows(emptyAggregatedVehicleTraitEffects())).toEqual([]);
    });

    it('lists a Skimmer: hover, terrain, free turn, ram crash and the melee penalty', () => {
        const rows = vehicleTraitRuleRows({
            ...emptyAggregatedVehicleTraitEffects(),
            hoverer: true,
            ignoresDifficultTerrain: true,
            freeTurn: true,
            crashesOnFailedRam: true,
            incomingMeleeToHitModifier: -10,
        });
        expect(rows).toEqual([
            { key: 'hoverer', labelKey: 'WH40K.Vehicle.TraitRules.Flag.hoverer' },
            { key: 'ignoresDifficultTerrain', labelKey: 'WH40K.Vehicle.TraitRules.Flag.ignoresDifficultTerrain' },
            { key: 'freeTurn', labelKey: 'WH40K.Vehicle.TraitRules.Flag.freeTurn' },
            { key: 'crashesOnFailedRam', labelKey: 'WH40K.Vehicle.TraitRules.Flag.crashesOnFailedRam' },
            { key: 'incomingMeleeToHitModifier', labelKey: 'WH40K.Vehicle.TraitRules.Value.incomingMeleeToHitModifier', value: '−10' },
        ]);
    });

    it('lists crew exposure and anti-air as localised values', () => {
        const rows = vehicleTraitRuleRows({ ...emptyAggregatedVehicleTraitEffects(), crewExposure: 'enclosed', antiAir: 'advanced' });
        expect(rows).toEqual([
            {
                key: 'crewExposure',
                labelKey: 'WH40K.Vehicle.TraitRules.Value.crewExposure',
                value: 'WH40K.Vehicle.TraitRules.CrewExposure.enclosed',
                valueIsKey: true,
            },
            { key: 'antiAir', labelKey: 'WH40K.Vehicle.TraitRules.Value.antiAir', value: 'WH40K.Vehicle.TraitRules.AntiAir.advanced', valueIsKey: true },
        ]);
    });

    it('lists orbital deployment with its in-flight penalty and landing delay', () => {
        const rows = vehicleTraitRuleRows({
            ...emptyAggregatedVehicleTraitEffects(),
            orbitalDeployment: true,
            deploymentIncomingToHitModifier: -30,
            postLandingDelayRounds: 1,
        });
        expect(rows.map((row) => [row.key, row.value])).toEqual([
            ['orbitalDeployment', undefined],
            ['deploymentIncomingToHitModifier', '−30'],
            ['postLandingDelayRounds', '1'],
        ]);
    });

    it('omits Ponderous and Enhanced Motive Systems once they have cancelled out', () => {
        expect(vehicleTraitRuleRows({ ...emptyAggregatedVehicleTraitEffects(), ponderous: false, enhancedMovement: false })).toEqual([]);
    });
});

describe('signedModifier', () => {
    it('prints a sign on both sides of zero', () => {
        expect(signedModifier(20)).toBe('+20');
        expect(signedModifier(-10)).toBe('−10');
    });
});
