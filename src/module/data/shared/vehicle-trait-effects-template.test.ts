import { describe, expect, it } from 'vitest';
import {
    aggregateVehicleTraitEffects,
    emptyAggregatedVehicleTraitEffects,
    type NamedVehicleTraitEffects,
    neutralVehicleTraitEffects,
    type VehicleTraitEffects,
    vehicleTraitEffectsSchema,
} from './vehicle-trait-effects-template.ts';

/** Build a named trait whose effects are the neutral defaults plus the given overrides. */
function trait(name: string, over: Partial<VehicleTraitEffects> = {}): NamedVehicleTraitEffects {
    return { name, effects: { ...neutralVehicleTraitEffects(), ...over } };
}

describe('aggregateVehicleTraitEffects', () => {
    it('returns the empty identity for no traits', () => {
        expect(aggregateVehicleTraitEffects([])).toStrictEqual(emptyAggregatedVehicleTraitEffects());
    });

    it('sets crew exposure from Open-Topped', () => {
        expect(aggregateVehicleTraitEffects([trait('Open-Topped', { crewExposure: 'open' })]).crewExposure).toBe('open');
    });

    it('lets Enclosed win over Open-Topped regardless of order (sealed hull beats open compartment)', () => {
        const open = trait('Open-Topped', { crewExposure: 'open' });
        const enclosed = trait('Enclosed', { crewExposure: 'enclosed' });
        expect(aggregateVehicleTraitEffects([open, enclosed]).crewExposure).toBe('enclosed');
        expect(aggregateVehicleTraitEffects([enclosed, open]).crewExposure).toBe('enclosed');
    });

    it('models Reinforced Armour (halve crit, excluding Righteous Fury)', () => {
        const agg = aggregateVehicleTraitEffects([trait('Reinforced Armour', { critDamageMultiplier: 0.5, critExcludesRighteousFury: true })]);
        expect(agg.critDamageMultiplier).toBe(0.5);
        expect(agg.critExcludesRighteousFury).toBe(true);
    });

    it('composes two crit-damage multipliers multiplicatively', () => {
        const agg = aggregateVehicleTraitEffects([trait('A', { critDamageMultiplier: 0.5 }), trait('B', { critDamageMultiplier: 0.5 })]);
        expect(agg.critDamageMultiplier).toBe(0.25);
    });

    it('concatenates per-test modifiers, each naming the trait it came from (Rugged + Tracked)', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Rugged', { testModifiers: [{ test: 'repair', value: 20 }] }),
            trait('Tracked Vehicle', { testModifiers: [{ test: 'difficultTerrain', value: 10 }], mitigatesMotiveCrit: true }),
        ]);
        expect(agg.testModifiers).toStrictEqual([
            { test: 'repair', value: 20, source: 'Rugged' },
            { test: 'difficultTerrain', value: 10, source: 'Tracked Vehicle' },
        ]);
        expect(agg.mitigatesMotiveCrit).toBe(true);
    });

    it('ORs the Walker movement/terrain flags', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Walker', { ignoresDifficultTerrain: true, cannotRam: true, freeTurn: true, canParryWithMelee: true }),
        ]);
        expect(agg.ignoresDifficultTerrain).toBe(true);
        expect(agg.cannotRam).toBe(true);
        expect(agg.freeTurn).toBe(true);
        expect(agg.canParryWithMelee).toBe(true);
    });

    it('takes the strongest deployment penalty and longest post-landing delay', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Orbital Deployment', { orbitalDeployment: true, deploymentIncomingToHitModifier: -30, postLandingDelayRounds: 1 }),
            trait('B', { deploymentIncomingToHitModifier: -10, postLandingDelayRounds: 2 }),
        ]);
        expect(agg.orbitalDeployment).toBe(true);
        expect(agg.deploymentIncomingToHitModifier).toBe(-30);
        expect(agg.postLandingDelayRounds).toBe(2);
    });

    it('models Enhanced Motive Systems (enhanced movement + Floor It! test bonus)', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Enhanced Motive Systems', { enhancedMovement: true, testModifiers: [{ test: 'floorIt', value: 20 }] }),
        ]);
        expect(agg.enhancedMovement).toBe(true);
        expect(agg.testModifiers).toStrictEqual([{ test: 'floorIt', value: 20, source: 'Enhanced Motive Systems' }]);
    });

    it('cancels Ponderous against Enhanced Motive Systems, in either order (OW)', () => {
        const ems = trait('Enhanced Motive Systems', { enhancedMovement: true });
        const ponderous = trait('Ponderous', { ponderous: true });
        for (const order of [
            [ems, ponderous],
            [ponderous, ems],
        ]) {
            const agg = aggregateVehicleTraitEffects(order);
            expect(agg.enhancedMovement).toBe(false);
            expect(agg.ponderous).toBe(false);
        }
        expect(aggregateVehicleTraitEffects([ponderous]).ponderous).toBe(true);
    });

    it('lets advanced anti-air win over rudimentary regardless of order', () => {
        const rud = trait('Anti-Air (Rudimentary)', { antiAir: 'rudimentary' });
        const adv = trait('Anti-Air (Advanced)', { antiAir: 'advanced' });
        expect(aggregateVehicleTraitEffects([rud]).antiAir).toBe('rudimentary');
        expect(aggregateVehicleTraitEffects([rud, adv]).antiAir).toBe('advanced');
        expect(aggregateVehicleTraitEffects([adv, rud]).antiAir).toBe('advanced');
    });

    it('takes the strongest incoming ranged / melee and explosion-ignition penalties', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Feral Machine Spirit', { incomingRangedToHitModifier: -10 }),
            trait('Holofield', { incomingRangedToHitModifier: -20 }),
            trait('Skimmer', { incomingMeleeToHitModifier: -10 }),
            trait('Extremely Volatile', { explosionChanceMultiplier: 2, explosionIgnitionTestModifier: -10 }),
        ]);
        expect(agg.incomingRangedToHitModifier).toBe(-20);
        expect(agg.incomingMeleeToHitModifier).toBe(-10);
        expect(agg.explosionChanceMultiplier).toBe(2);
        expect(agg.explosionIgnitionTestModifier).toBe(-10);
    });

    it("lists every trait's to-hit penalty with the condition it applies under (#678)", () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Holofield', { incomingRangedToHitModifier: -20, incomingRangedCondition: 'moving' }),
            trait('Skimmer', { incomingMeleeToHitModifier: -10 }),
            trait('Orbital Deployment', { orbitalDeployment: true, deploymentIncomingToHitModifier: -30 }),
        ]);
        expect(agg.incomingToHit).toEqual([
            { value: -20, attack: 'ranged', condition: 'moving', trait: 'Holofield' },
            { value: -10, attack: 'melee', condition: '', trait: 'Skimmer' },
            { value: -30, attack: 'ranged', condition: 'deploying', trait: 'Orbital Deployment' },
        ]);
    });

    it("takes the highest-rated force field, with that field's own overload and bypass rules (#678)", () => {
        const daemonEngine = trait('Daemon Engine', {
            forceFieldRating: 30,
            forceFieldNeverOverloads: true,
            forceFieldBypassQualities: ['sanctified', 'force'],
            structuralRegeneration: '1d5',
        });
        const shieldGenerator = trait('Shield Generator', {
            forceFieldRating: 40,
            forceFieldCraftsmanship: 'common',
            forceFieldOverload: { poor: 20, common: 10, good: 5, best: 1 },
        });
        const agg = aggregateVehicleTraitEffects([daemonEngine, shieldGenerator]);
        expect({
            rating: agg.forceFieldRating,
            neverOverloads: agg.forceFieldNeverOverloads,
            overloadMax: agg.forceFieldOverloadMax,
            bypass: agg.forceFieldBypassQualities,
        }).toEqual({ rating: 40, neverOverloads: false, overloadMax: 10, bypass: [] });
        expect(agg.structuralRegeneration).toBe('1d5');
        const daemonic = aggregateVehicleTraitEffects([daemonEngine]);
        expect({ neverOverloads: daemonic.forceFieldNeverOverloads, bypass: daemonic.forceFieldBypassQualities }).toEqual({
            neverOverloads: true,
            bypass: ['sanctified', 'force'],
        });
    });

    it('leaves the overload to the GM when the field records no craftsmanship', () => {
        expect(
            aggregateVehicleTraitEffects([trait('Shield Generator', { forceFieldRating: 40, forceFieldOverload: { poor: 20, common: 10, good: 5, best: 1 } })])
                .forceFieldOverloadMax,
        ).toBeNull();
    });

    it('composes repair-time multipliers (Ramshackle halves repairs; Tracked doubles motive repairs, Wheeled halves them)', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Ramshackle', { repairTimeMultiplier: 0.5, ramSelfDamageMultiplier: 2, righteousFuryCritDie: '1d10', alwaysLightlyDamaged: true }),
            trait('Tracked Vehicle', { motiveRepairTimeMultiplier: 2 }),
            trait('Wheeled Vehicle', { motiveRepairTimeMultiplier: 0.5 }),
        ]);
        expect(agg.repairTimeMultiplier).toBe(0.5);
        expect(agg.motiveRepairTimeMultiplier).toBe(1);
        expect(agg.ramSelfDamageMultiplier).toBe(2);
        expect(agg.righteousFuryCritDie).toBe('1d10');
        expect(agg.alwaysLightlyDamaged).toBe(true);
    });

    it('leaves an unset multiplier null', () => {
        expect(aggregateVehicleTraitEffects([trait('Rugged')]).repairTimeMultiplier).toBeNull();
    });

    it('names the traits behind each damage-facing effect, for the cards', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Feral Machine Spirit', { incomingRangedToHitModifier: -10 }),
            trait('Holofield', { incomingRangedToHitModifier: -20 }),
            trait('Skimmer', { incomingMeleeToHitModifier: -10 }),
            trait('Reinforced Armour', { critDamageMultiplier: 0.5, critExcludesRighteousFury: true }),
            trait('Daemon Engine', { forceFieldRating: 30 }),
            trait('Shield Generator', { forceFieldRating: 40 }),
            trait('Ramshackle', { righteousFuryCritDie: '1d10' }),
            trait('Open-Topped', { crewExposure: 'open' }),
            trait('Damage Control', { rerollRighteousFuryCrit: true }),
        ]);
        expect(agg.sources).toEqual({
            critDamageMultiplier: ['Reinforced Armour'],
            incomingRangedToHitModifier: 'Holofield',
            incomingMeleeToHitModifier: 'Skimmer',
            forceFieldRating: 'Shield Generator',
            righteousFuryCritDie: 'Ramshackle',
            crewExposure: 'Open-Topped',
            rerollRighteousFuryCrit: 'Damage Control',
        });
    });

    it('attributes crew exposure to the sealing trait when Enclosed beats Open-Topped', () => {
        const agg = aggregateVehicleTraitEffects([trait('Enclosed', { crewExposure: 'enclosed' }), trait('Open-Topped', { crewExposure: 'open' })]);
        expect(agg.sources.crewExposure).toBe('Enclosed');
    });

    it('keeps the stronger penalty source when a weaker one follows', () => {
        const agg = aggregateVehicleTraitEffects([
            trait('Holofield', { incomingRangedToHitModifier: -20 }),
            trait('Feral Machine Spirit', { incomingRangedToHitModifier: -10 }),
        ]);
        expect(agg.sources.incomingRangedToHitModifier).toBe('Holofield');
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
