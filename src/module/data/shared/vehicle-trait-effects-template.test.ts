import { describe, expect, it } from 'vitest';
import {
    aggregateVehicleTraitEffects,
    emptyAggregatedVehicleTraitEffects,
    type VehicleTraitEffects,
    vehicleTraitEffectsSchema,
} from './vehicle-trait-effects-template.ts';

/** Build a full trait-effects object with the given overrides. */
function eff(over: Partial<VehicleTraitEffects> = {}): VehicleTraitEffects {
    return {
        testModifiers: [],
        critDamageMultiplier: null,
        critExcludesRighteousFury: false,
        mitigatesMotiveCrit: false,
        crewExposure: '',
        ignoresDifficultTerrain: false,
        amphibious: false,
        cannotRam: false,
        freeTurn: false,
        canParryWithMelee: false,
        enhancedMovement: false,
        orbitalDeployment: false,
        deploymentIncomingToHitModifier: 0,
        postLandingDelayRounds: 0,
        ...over,
    };
}

describe('aggregateVehicleTraitEffects', () => {
    it('returns the empty identity for no traits', () => {
        expect(aggregateVehicleTraitEffects([])).toStrictEqual(emptyAggregatedVehicleTraitEffects());
    });

    it('sets crew exposure from Open-Topped', () => {
        expect(aggregateVehicleTraitEffects([eff({ crewExposure: 'open' })]).crewExposure).toBe('open');
    });

    it('lets Enclosed win over Open-Topped regardless of order (sealed hull beats open compartment)', () => {
        expect(aggregateVehicleTraitEffects([eff({ crewExposure: 'open' }), eff({ crewExposure: 'enclosed' })]).crewExposure).toBe('enclosed');
        expect(aggregateVehicleTraitEffects([eff({ crewExposure: 'enclosed' }), eff({ crewExposure: 'open' })]).crewExposure).toBe('enclosed');
    });

    it('models Reinforced Armour (halve crit, excluding Righteous Fury)', () => {
        const agg = aggregateVehicleTraitEffects([eff({ critDamageMultiplier: 0.5, critExcludesRighteousFury: true })]);
        expect(agg.critDamageMultiplier).toBe(0.5);
        expect(agg.critExcludesRighteousFury).toBe(true);
    });

    it('composes two crit-damage multipliers multiplicatively', () => {
        const agg = aggregateVehicleTraitEffects([eff({ critDamageMultiplier: 0.5 }), eff({ critDamageMultiplier: 0.5 })]);
        expect(agg.critDamageMultiplier).toBe(0.25);
    });

    it('concatenates per-test modifiers (Rugged + Tracked)', () => {
        const agg = aggregateVehicleTraitEffects([
            eff({ testModifiers: [{ test: 'repair', value: 20 }] }),
            eff({ testModifiers: [{ test: 'difficultTerrain', value: 10 }], mitigatesMotiveCrit: true }),
        ]);
        expect(agg.testModifiers).toStrictEqual([
            { test: 'repair', value: 20 },
            { test: 'difficultTerrain', value: 10 },
        ]);
        expect(agg.mitigatesMotiveCrit).toBe(true);
    });

    it('ORs the Walker movement/terrain flags', () => {
        const agg = aggregateVehicleTraitEffects([eff({ ignoresDifficultTerrain: true, cannotRam: true, freeTurn: true, canParryWithMelee: true })]);
        expect(agg.ignoresDifficultTerrain).toBe(true);
        expect(agg.cannotRam).toBe(true);
        expect(agg.freeTurn).toBe(true);
        expect(agg.canParryWithMelee).toBe(true);
    });

    it('takes the strongest deployment penalty and longest post-landing delay', () => {
        const agg = aggregateVehicleTraitEffects([
            eff({ orbitalDeployment: true, deploymentIncomingToHitModifier: -30, postLandingDelayRounds: 1 }),
            eff({ deploymentIncomingToHitModifier: -10, postLandingDelayRounds: 2 }),
        ]);
        expect(agg.orbitalDeployment).toBe(true);
        expect(agg.deploymentIncomingToHitModifier).toBe(-30);
        expect(agg.postLandingDelayRounds).toBe(2);
    });

    it('models Enhanced Motive Systems (enhanced movement + Floor It! test bonus)', () => {
        const agg = aggregateVehicleTraitEffects([eff({ enhancedMovement: true, testModifiers: [{ test: 'floorIt', value: 20 }] })]);
        expect(agg.enhancedMovement).toBe(true);
        expect(agg.testModifiers).toStrictEqual([{ test: 'floorIt', value: 20 }]);
    });
});

describe('vehicleTraitEffectsSchema', () => {
    it('allows the neutral blank crewExposure default (V14 "may not be a blank string" regression)', () => {
        // A trait that does not touch crew exposure carries the '' default, which is
        // not one of the choices; the field MUST permit blank or the item fails to
        // initialize and breaks actor hydration. Skips when the Foundry field runtime
        // is absent (happy-dom) — the assertion runs under the Tier A boot.
        let blank: boolean | undefined;
        try {
            // `.fields` is Foundry's untyped DataSchema at this boundary; cast to the
            // one field's option shape rather than a Record (schema-typing preserved).
            const field = (vehicleTraitEffectsSchema().fields as { crewExposure?: { options?: { blank?: boolean } } }).crewExposure;
            blank = field?.options?.blank;
        } catch {
            return;
        }
        expect(blank).toBe(true);
    });
});
