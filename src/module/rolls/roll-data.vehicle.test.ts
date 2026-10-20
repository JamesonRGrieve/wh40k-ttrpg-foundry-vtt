import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { aggregateVehicleTraitEffects, emptyAggregatedVehicleTraitEffects, type VehicleTraitEffects } from '../data/shared/vehicle-trait-effects-template.ts';
import { VEHICLE_TRAIT_BUCKET } from '../rules/vehicle-damage.ts';
import { WeaponRollData } from './roll-data';

/** A craft target whose traits fold to the given effects. */
function craft(traits: [string, Partial<VehicleTraitEffects>][]): WeaponRollData['targetActor'] {
    const system = {
        gameSystem: 'dh2',
        armour: { front: { value: 30 }, side: { value: 22 }, rear: { value: 16 } },
        integrity: { max: 35, value: 35, critical: 0 },
        traitEffects: aggregateVehicleTraitEffects(traits.map(([name, over]) => ({ name, effects: { ...emptyAggregatedVehicleTraitEffects(), ...over } }))),
    };
    // eslint-disable-next-line no-restricted-syntax -- test: a craft reduced to the `system` the target-vehicle collector reads
    return { system } as unknown as WeaponRollData['targetActor'];
}

function attack(target: WeaponRollData['targetActor'], isMelee: boolean): WeaponRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test the vehicle folds
    const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
    rd.modifiers = {};
    rd.expandedBuckets = {};
    rd.modifierSources = [];
    rd.targetActor = target;
    // eslint-disable-next-line no-restricted-syntax -- test: a weapon reduced to the melee flag the folds read
    rd.weapon = { isMelee, isRanged: !isMelee } as unknown as WeaponRollData['weapon'];
    rd.actions = { 'Standard Attack': 'Standard Attack', 'Called Shot': 'Called Shot' };
    rd.action = 'Standard Attack';
    rd.crewTarget = null;
    return rd;
}

describe('WeaponRollData vehicle traits on the attack (Path B, content#28)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', {
            i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, string>) => `${key}:${data['trait'] ?? ''}` },
        });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("folds the target's shooting penalty as a row naming its trait", () => {
        const rd = attack(
            craft([
                ['Feral Machine Spirit', { incomingRangedToHitModifier: -10 }],
                ['Holofield', { incomingRangedToHitModifier: -20 }],
            ]),
            false,
        );
        rd.applyTargetVehicleModifiers();
        expect(rd.modifiers[VEHICLE_TRAIT_BUCKET]).toBe(-20);
        expect(rd.expandedBuckets[VEHICLE_TRAIT_BUCKET]).toEqual([
            { key: `${VEHICLE_TRAIT_BUCKET}.Holofield`, label: 'Holofield', value: -20, source: 'WH40K.Vehicle.Attack.TraitSource:Holofield' },
        ]);
    });

    it('folds a melee penalty only on a melee attack (Skimmer)', () => {
        const skimmer = craft([['Skimmer', { incomingMeleeToHitModifier: -10 }]]);
        const melee = attack(skimmer, true);
        melee.applyTargetVehicleModifiers();
        expect(melee.modifiers[VEHICLE_TRAIT_BUCKET]).toBe(-10);
        const shot = attack(skimmer, false);
        shot.applyTargetVehicleModifiers();
        expect(shot.modifiers[VEHICLE_TRAIT_BUCKET]).toBe(0);
    });

    it('adds nothing against a creature', () => {
        // eslint-disable-next-line no-restricted-syntax -- test: a creature target reduced to its `system`
        const rd = attack({ system: { wounds: { value: 10 } } } as unknown as WeaponRollData['targetActor'], false);
        rd.applyTargetVehicleModifiers();
        expect(rd.expandedBuckets[VEHICLE_TRAIT_BUCKET]).toEqual([]);
    });
});

describe('WeaponRollData crew Called Shot (Open-Topped, content#28)', () => {
    it('makes an attack on crew in an open vehicle a Called Shot', () => {
        const rd = attack(null, false);
        rd.crewTarget = { vehicleName: 'Hectin Autocarriage', riderTargetableInMelee: false };
        rd.requireCrewCalledShot();
        expect(rd.action).toBe('Called Shot');
    });

    it("leaves a melee attack on a Bike's rider free", () => {
        const rd = attack(null, true);
        rd.crewTarget = { vehicleName: 'Bike', riderTargetableInMelee: true };
        rd.requireCrewCalledShot();
        expect(rd.action).toBe('Standard Attack');
    });

    it('leaves any other attack alone', () => {
        const rd = attack(null, false);
        rd.requireCrewCalledShot();
        expect(rd.action).toBe('Standard Attack');
    });
});
