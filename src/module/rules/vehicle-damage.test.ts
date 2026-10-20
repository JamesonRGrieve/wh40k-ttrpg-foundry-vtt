import { describe, expect, it } from 'vitest';
import {
    armourFacingOf,
    chartLocationsFor,
    crewExposedToArea,
    crewTargeting,
    incomingVehicleModifiers,
    isVehicleLocationId,
    resolveVehicleDamage,
    righteousFuryChartValue,
    struckArmourFacing,
    type VehicleHitLocationBand,
    vehicleCritRowFor,
    vehicleFacingFromBearings,
    vehicleHitLocation,
} from './vehicle-damage.ts';

/** Table 7-29 / 8-24 as DH2 and OW print it. */
const BANDS: VehicleHitLocationBand[] = [
    { max: 20, location: 'motive' },
    { max: 60, location: 'hull' },
    { max: 80, location: 'weapon' },
    { max: 100, location: 'turret' },
];

const ARMED = { hasTurret: true, weaponFacings: ['front'] };

describe('vehicleFacingFromBearings (DH2 Core p. 254 facings)', () => {
    it('reads an attacker dead ahead as Front and dead astern as Rear', () => {
        expect(vehicleFacingFromBearings(90, 90)).toBe('front');
        expect(vehicleFacingFromBearings(90, 270)).toBe('rear');
    });

    it('takes the 45° boundaries into Front and Rear', () => {
        expect(vehicleFacingFromBearings(0, 45)).toBe('front');
        expect(vehicleFacingFromBearings(0, 315)).toBe('front');
        expect(vehicleFacingFromBearings(0, 135)).toBe('rear');
        expect(vehicleFacingFromBearings(0, 225)).toBe('rear');
    });

    it('puts clockwise of the nose on the right flank, anticlockwise on the left', () => {
        expect(vehicleFacingFromBearings(0, 90)).toBe('right');
        expect(vehicleFacingFromBearings(0, 270)).toBe('left');
    });

    it('wraps bearings past 360', () => {
        expect(vehicleFacingFromBearings(350, 10)).toBe('front');
        expect(vehicleFacingFromBearings(-90, 90)).toBe('rear');
    });
});

describe('armour facings', () => {
    it('reads both flanks from the Side value', () => {
        expect(armourFacingOf('left')).toBe('side');
        expect(armourFacingOf('right')).toBe('side');
        expect(armourFacingOf('front')).toBe('front');
        expect(armourFacingOf('rear')).toBe('rear');
    });

    it('meets a Turret hit with Front armour even from the rear', () => {
        expect(struckArmourFacing('rear', 'turret')).toBe('front');
        expect(struckArmourFacing('rear', 'hull')).toBe('rear');
    });
});

describe('vehicleHitLocation (Table 7-29)', () => {
    it('maps each band', () => {
        expect(vehicleHitLocation(1, BANDS, ARMED, 'front').location).toBe('motive');
        expect(vehicleHitLocation(20, BANDS, ARMED, 'front').location).toBe('motive');
        expect(vehicleHitLocation(21, BANDS, ARMED, 'front').location).toBe('hull');
        expect(vehicleHitLocation(61, BANDS, ARMED, 'front').location).toBe('weapon');
        expect(vehicleHitLocation(100, BANDS, ARMED, 'front').location).toBe('turret');
    });

    it('strikes the Hull when it names a Turret the vehicle does not carry', () => {
        const located = vehicleHitLocation(90, BANDS, { hasTurret: false, weaponFacings: [] }, 'front');
        expect(located).toEqual({ location: 'hull', tableRoll: 90, redirectedFrom: 'turret' });
    });

    it('strikes the Hull when it names a Weapon and none sits on the struck facing', () => {
        const located = vehicleHitLocation(70, BANDS, { hasTurret: true, weaponFacings: ['front'] }, 'rear');
        expect(located.location).toBe('hull');
        expect(located.redirectedFrom).toBe('weapon');
    });

    it('counts an all-round or unarced weapon on every facing', () => {
        expect(vehicleHitLocation(70, BANDS, { hasTurret: false, weaponFacings: ['all'] }, 'rear').location).toBe('weapon');
        expect(vehicleHitLocation(70, BANDS, { hasTurret: false, weaponFacings: [''] }, 'left').location).toBe('weapon');
    });

    it('strikes the Hull on a line with one chart and no table', () => {
        expect(vehicleHitLocation(99, null, ARMED, 'front')).toEqual({ location: 'hull', tableRoll: 0, redirectedFrom: null });
    });
});

describe('resolveVehicleDamage (SI loss, then Critical damage)', () => {
    const base = { penetration: 0, armour: 0, integrity: 35, critical: 0, critMultiplier: null };

    it('takes damage less armour off Structural Integrity', () => {
        const outcome = resolveVehicleDamage({ ...base, damage: 40, armour: 30 });
        expect(outcome).toMatchObject({ damage: 10, integrityLoss: 10, integrityAfter: 25, excess: 0, criticalTaken: 0, criticalAfter: 0 });
    });

    it('lets Penetration reduce the armour, never below zero', () => {
        expect(resolveVehicleDamage({ ...base, damage: 20, armour: 16, penetration: 5 }).damage).toBe(9);
        expect(resolveVehicleDamage({ ...base, damage: 20, armour: 4, penetration: 10 }).damage).toBe(20);
    });

    it('deals nothing when armour absorbs the hit (no 1-point minimum on a vehicle)', () => {
        expect(resolveVehicleDamage({ ...base, damage: 10, armour: 30 }).damage).toBe(0);
    });

    it('turns damage past Integrity into cumulative Critical damage', () => {
        const outcome = resolveVehicleDamage({ ...base, damage: 9, integrity: 5, critical: 2 });
        expect(outcome).toMatchObject({ integrityLoss: 5, integrityAfter: 0, excess: 4, criticalTaken: 4, criticalAfter: 6 });
    });

    it('halves Critical damage under Reinforced Armour, rounding up', () => {
        const outcome = resolveVehicleDamage({ ...base, damage: 7, integrity: 0, critMultiplier: 0.5 });
        expect(outcome).toMatchObject({ excess: 7, critMultiplier: 0.5, criticalTaken: 4, criticalAfter: 4 });
    });

    it('reports no multiplier when nothing passed Integrity', () => {
        expect(resolveVehicleDamage({ ...base, damage: 5, critMultiplier: 0.5 }).critMultiplier).toBeNull();
    });
});

describe('righteousFuryChartValue', () => {
    it('reads the roll itself when Reinforced Armour excludes Righteous Fury', () => {
        expect(righteousFuryChartValue(5, 0.5, true)).toBe(5);
    });

    it('applies a multiplier that reaches Righteous Fury, rounding up', () => {
        expect(righteousFuryChartValue(5, 0.5, false)).toBe(3);
    });

    it('reads the roll with no multiplier', () => {
        expect(righteousFuryChartValue(4, null, false)).toBe(4);
    });
});

describe('vehicleCritRowFor', () => {
    const rows = [
        { min: 3, max: 3, text: 'three' },
        { min: 1, max: 2, text: 'one-two' },
        { min: 10, max: 999, text: 'destroyed' },
        { min: 4, max: 9, text: 'mid' },
    ];

    it('finds the row a value lands in, whatever order the table holds them', () => {
        expect(vehicleCritRowFor(rows, 2)?.text).toBe('one-two');
        expect(vehicleCritRowFor(rows, 3)?.text).toBe('three');
        expect(vehicleCritRowFor(rows, 7)?.text).toBe('mid');
    });

    it('lands a value past the last row on the last, and below the first on the first', () => {
        expect(
            vehicleCritRowFor(
                [
                    { min: 1, max: 9, text: 'a' },
                    { min: 10, max: 10, text: 'last' },
                ],
                14,
            )?.text,
        ).toBe('last');
        expect(vehicleCritRowFor(rows, 0)?.text).toBe('one-two');
    });

    it('returns null for an empty chart', () => {
        expect(vehicleCritRowFor([], 3)).toBeNull();
    });
});

describe('chartLocationsFor', () => {
    it('prefers the location chart, then the single chart', () => {
        expect(chartLocationsFor('motive')).toEqual(['motive', 'any']);
    });
});

describe('isVehicleLocationId', () => {
    it('accepts the four locations and rejects a creature location', () => {
        expect(['motive', 'hull', 'weapon', 'turret'].every(isVehicleLocationId)).toBe(true);
        expect(isVehicleLocationId('body')).toBe(false);
    });
});

describe('crew exposure (DH2 Core p. 187 Open-Topped, Bike)', () => {
    const open = { exposure: 'open', riderTargetableInMelee: false, isMelee: false, attackerAboard: false };

    it('lets a Called Shot single out crew in an open vehicle', () => {
        expect(crewTargeting(open)).toBe('calledShot');
    });

    it('shelters the crew of an enclosed vehicle, or one whose traits say nothing', () => {
        expect(crewTargeting({ ...open, exposure: 'enclosed' })).toBe('sheltered');
        expect(crewTargeting({ ...open, exposure: '' })).toBe('sheltered');
    });

    it("frees a melee attack on a Bike's rider of the Called Shot", () => {
        expect(crewTargeting({ ...open, riderTargetableInMelee: true, isMelee: true })).toBe('free');
        expect(crewTargeting({ ...open, riderTargetableInMelee: true, isMelee: false })).toBe('calledShot');
    });

    it('lets those aboard the same vehicle reach each other', () => {
        expect(crewTargeting({ ...open, exposure: 'enclosed', attackerAboard: true })).toBe('free');
    });

    it('exposes crew to Blast and Spray only in an open vehicle', () => {
        expect(crewExposedToArea('open')).toBe(true);
        expect(crewExposedToArea('enclosed')).toBe(false);
        expect(crewExposedToArea('')).toBe(false);
    });
});

describe('incomingVehicleModifiers', () => {
    const effects = {
        incomingRangedToHitModifier: -20,
        incomingMeleeToHitModifier: -10,
        sources: { incomingRangedToHitModifier: 'Holofield', incomingMeleeToHitModifier: 'Skimmer' },
    };

    it('names the trait behind a shooting penalty', () => {
        expect(incomingVehicleModifiers(effects, false)).toEqual([{ value: -20, trait: 'Holofield' }]);
    });

    it('names the trait behind a melee penalty', () => {
        expect(incomingVehicleModifiers(effects, true)).toEqual([{ value: -10, trait: 'Skimmer' }]);
    });

    it('adds no row when the traits impose nothing', () => {
        expect(incomingVehicleModifiers({ ...effects, incomingRangedToHitModifier: 0 }, false)).toEqual([]);
    });
});
