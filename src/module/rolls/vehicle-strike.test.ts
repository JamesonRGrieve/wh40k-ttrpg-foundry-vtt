import { describe, expect, it } from 'vitest';
import {
    aggregateVehicleTraitEffects,
    type NamedVehicleTraitEffects,
    neutralVehicleTraitEffects,
    type VehicleTraitEffects,
} from '../data/shared/vehicle-trait-effects-template.ts';
import {
    attackedFromAboveOrBelow,
    crewTargetOf,
    forceFieldBypassedBy,
    forceFieldRollFor,
    parseVehicleStrike,
    readVehicleDurability,
    rollVehicleForceField,
    stampForceField,
    strikeFor,
    struckFacing,
    vehicleMountProfile,
    vehicleTargetProfile,
    vehicleTargetProfileFromTokens,
    type VehicleStrike,
    type VehicleTargetProfile,
} from './vehicle-strike.ts';

/** One trait's effects over the neutral defaults. */
function trait(name: string, over: Partial<VehicleTraitEffects>): NamedVehicleTraitEffects {
    return { name, effects: { ...neutralVehicleTraitEffects(), ...over } };
}

/** A craft's `system` as its DataModel prepares it: the Chimera's printed line, with its traits folded. */
function craftSystem(traits: NamedVehicleTraitEffects[] = [], line = 'dh2'): object {
    return {
        gameSystem: line,
        armour: { front: { value: 30, descriptor: '' }, side: { value: 22, descriptor: '' }, rear: { value: 16, descriptor: '' } },
        integrity: { max: 35, value: 35, critical: 0 },
        traitEffects: aggregateVehicleTraitEffects(traits),
        hardpoints: [],
    };
}

const TURRET_WEAPON = { type: 'weapon', system: { mounting: 'turret', facing: 'all', hardpoint: '', innate: false } };
const HULL_WEAPON = { type: 'weapon', system: { mounting: 'hull', facing: 'front', hardpoint: '', innate: false } };

describe('readVehicleDurability', () => {
    it("reads a craft's facing armour, Structural Integrity and trait effects", () => {
        const durability = readVehicleDurability(craftSystem());
        expect(durability?.armour.rear.value).toBe(16);
        expect(durability?.integrity).toEqual({ max: 35, value: 35, critical: 0 });
        expect(durability?.gameSystem).toBe('dh2');
    });

    it('rejects a creature, a voidship and nothing at all', () => {
        expect(readVehicleDurability({ armour: { body: { value: 4 } }, wounds: { value: 10 } })).toBeNull();
        expect(readVehicleDurability({ armour: 20, hullIntegrity: { value: 40, max: 40 } })).toBeNull();
        expect(readVehicleDurability(undefined)).toBeNull();
    });
});

describe('vehicleMountProfile', () => {
    it('finds the turret and the facings of the other weapons', () => {
        expect(vehicleMountProfile([TURRET_WEAPON, HULL_WEAPON, { type: 'vehicleTrait', system: {} }], false)).toEqual({
            hasTurret: true,
            weaponFacings: ['front'],
        });
    });

    it('counts only installed or innate weapons on a craft with hardpoints', () => {
        const installed = { type: 'weapon', system: { mounting: 'sponson', facing: 'left', hardpoint: 'left-sponson', innate: false } };
        const innate = { type: 'weapon', system: { mounting: '', facing: '', hardpoint: '', innate: true } };
        expect(vehicleMountProfile([TURRET_WEAPON, installed, innate], true)).toEqual({ hasTurret: false, weaponFacings: ['left', ''] });
    });
});

describe('vehicleTargetProfile', () => {
    it("carries the line's rules, the facing and the trait effects the damage path reads", () => {
        const system = craftSystem([
            trait('Reinforced Armour', { critDamageMultiplier: 0.5, critExcludesRighteousFury: true }),
            trait('Shield Generator', { forceFieldRating: 40 }),
            trait('Ramshackle', { righteousFuryCritDie: '1d10' }),
        ]);
        const profile = vehicleTargetProfile({ system, items: [TURRET_WEAPON] }, 'rear', false);
        expect(profile?.rules.hitLocations?.length).toBe(4);
        expect(profile?.facing).toBe('rear');
        expect(profile?.mounts.hasTurret).toBe(true);
        expect(profile?.forceField).toEqual({
            rating: 40,
            source: 'Shield Generator',
            neverOverloads: false,
            overloadMax: null,
            craftsmanship: '',
            bypassQualities: [],
        });
        expect(profile?.righteousFuryDie).toBe('1d10');
        expect(profile?.righteousFuryDieSource).toBe('Ramshackle');
        expect(profile?.critMultiplier).toBe(0.5);
        expect(profile?.critMultiplierSources).toEqual(['Reinforced Armour']);
    });

    it("keeps the line's Righteous Fury die when no trait changes it", () => {
        const profile = vehicleTargetProfile({ system: craftSystem(), items: [] }, 'front', false);
        expect(profile?.righteousFuryDie).toBe('1d5');
        expect(profile?.righteousFuryDieSource).toBe('');
        expect(profile?.forceField).toBeNull();
    });

    it('is null for anything but a craft', () => {
        expect(vehicleTargetProfile({ system: { wounds: { value: 3 } }, items: [] }, 'front', false)).toBeNull();
    });
});

describe('struck facing from tokens', () => {
    // Foundry tokens face down the screen at rotation 0 (bearing 90°).
    const chimera = { center: { x: 500, y: 500 }, document: { rotation: 0 } };

    it('reads an attacker the craft points at as its Front, one behind it as its Rear', () => {
        expect(struckFacing(chimera, { x: 500, y: 900 })).toBe('front');
        expect(struckFacing(chimera, { x: 500, y: 100 })).toBe('rear');
    });

    it('turns with the token', () => {
        expect(struckFacing({ ...chimera, document: { rotation: 180 } }, { x: 500, y: 100 })).toBe('front');
    });

    const grid = { size: 100, distance: 1 };
    const still = { movedMetres: 0 };

    it('assumes Front when either token is off the canvas', () => {
        const profile = vehicleTargetProfileFromTokens({ system: craftSystem(), items: [] }, chimera, undefined, grid, still);
        expect(profile?.facing).toBe('front');
        expect(profile?.facingAssumed).toBe(true);
    });

    it('reads Rear for an attacker above the craft, steeper than 45° (DH2 Core p. 253)', () => {
        // 1 m in front of the nose, 5 m up.
        const flyer = { center: { x: 500, y: 600 }, document: { rotation: 0, elevation: 5 } };
        const profile = vehicleTargetProfileFromTokens({ system: craftSystem(), items: [] }, chimera, flyer, grid, still);
        expect({ facing: profile?.facing, fromAboveOrBelow: profile?.fromAboveOrBelow }).toEqual({ facing: 'rear', fromAboveOrBelow: true });
        expect(attackedFromAboveOrBelow(chimera, flyer, grid)).toBe(true);
    });

    it('keeps the bearing for an attacker above it at a shallow angle', () => {
        // 4 m in front of the nose, 2 m up.
        const shooter = { center: { x: 500, y: 900 }, document: { rotation: 0, elevation: 2 } };
        expect(vehicleTargetProfileFromTokens({ system: craftSystem(), items: [] }, chimera, shooter, grid, still)?.facing).toBe('front');
    });

    it('reads the craft as moving when it moved on its last turn, and airborne when off the ground', () => {
        const shooter = { center: { x: 500, y: 900 }, document: { rotation: 0 } };
        const flying = { ...chimera, document: { rotation: 0, elevation: 30 } };
        expect(vehicleTargetProfileFromTokens({ system: craftSystem(), items: [] }, flying, shooter, grid, { movedMetres: 12 })?.motion).toEqual({
            moving: true,
            airborne: true,
            mobile: true,
        });
        expect(vehicleTargetProfileFromTokens({ system: craftSystem(), items: [] }, chimera, shooter, grid, still)?.motion).toEqual({
            moving: false,
            airborne: false,
            mobile: true,
        });
    });

    it('reads an Immobile craft as not mobile', () => {
        const shooter = { center: { x: 500, y: 900 }, document: { rotation: 0 } };
        const system = craftSystem([trait('Immobile', { immobile: true })]);
        expect(vehicleTargetProfileFromTokens({ system, items: [] }, chimera, shooter, grid, still)?.motion.mobile).toBe(false);
    });
});

function strike(over: Partial<VehicleStrike> = {}): VehicleStrike {
    const profile = vehicleTargetProfile({ system: craftSystem(), items: [] }, 'rear', false);
    if (profile === null) throw new Error('craft profile expected');
    return { ...strikeFor(profile, { location: 'hull', tableRoll: 32, redirectedFrom: null }, 'reversed'), ...over };
}

/** The profile of a Chimera with the given traits, struck from the front. */
function craftProfile(traits: NamedVehicleTraitEffects[]): VehicleTargetProfile {
    const profile = vehicleTargetProfile({ system: craftSystem(traits), items: [] }, 'front', false);
    if (profile === null) throw new Error('craft profile expected');
    return profile;
}

describe('force fields', () => {
    const field = { rating: 40, source: 'Shield Generator', neverOverloads: false, overloadMax: null, craftsmanship: '', bypassQualities: [] };

    it('nullifies at or under the rating', () => {
        expect(forceFieldRollFor(field, 40).nullified).toBe(true);
        expect(forceFieldRollFor(field, 41).nullified).toBe(false);
    });

    it("flags an overload the trait's data cannot decide", () => {
        expect(forceFieldRollFor(field, 5).overloadUnmodelled).toBe(true);
        expect(forceFieldRollFor({ ...field, neverOverloads: true }, 5).overloadUnmodelled).toBe(false);
    });

    it('overloads at or under its craftsmanship overload chance, still stopping the attack (DH2 Core p. 169) (#678)', () => {
        const common = { ...field, overloadMax: 10, craftsmanship: 'common' };
        expect(forceFieldRollFor(common, 10)).toMatchObject({ nullified: true, overloaded: true, overloadUnmodelled: false, overloadMax: 10 });
        expect(forceFieldRollFor(common, 11)).toMatchObject({ nullified: true, overloaded: false });
        expect(forceFieldRollFor({ ...common, neverOverloads: true }, 3)).toMatchObject({ overloaded: false, overloadMax: null });
    });

    it('is bypassed by a weapon carrying a quality it does not stop (Daemon Engine: Sanctified, Force) (#678)', () => {
        const daemonic = { ...field, rating: 30, source: 'Daemon Engine', neverOverloads: true, bypassQualities: ['sanctified', 'force'] };
        expect(forceFieldBypassedBy(daemonic, (quality) => quality === 'force')).toBe('force');
        expect(forceFieldBypassedBy(daemonic, (quality) => quality === 'tearing')).toBe('');
    });

    it('lets a bypassing attack through unrolled', async () => {
        const profile = craftProfile([trait('Daemon Engine', { forceFieldRating: 30, forceFieldNeverOverloads: true, forceFieldBypassQualities: ['force'] })]);
        expect(await rollVehicleForceField(profile, (quality) => quality === 'force')).toMatchObject({ bypassedBy: 'force', nullified: false, roll: 0 });
    });

    it("resolves the Shield Generator's overload from its trait's table at its craftsmanship", () => {
        const profile = vehicleTargetProfile(
            {
                system: craftSystem([
                    trait('Shield Generator', {
                        forceFieldRating: 40,
                        forceFieldCraftsmanship: 'good',
                        forceFieldOverload: { poor: 20, common: 10, good: 5, best: 1 },
                    }),
                ]),
                items: [],
            },
            'front',
            false,
        );
        expect(profile?.forceField).toMatchObject({ overloadMax: 5, craftsmanship: 'good' });
    });

    it('stamps one roll on every hit of the attack that struck the vehicle', () => {
        const roll = forceFieldRollFor(field, 12);
        const hits = [{ vehicleStrike: strike() }, { vehicleStrike: strike() }, { vehicleStrike: null }];
        stampForceField(hits, roll);
        expect(hits.map((hit) => hit.vehicleStrike?.forceField?.roll)).toEqual([12, 12, undefined]);
    });
});

describe('parseVehicleStrike', () => {
    it('round-trips a strike through the card attribute', () => {
        const original = strike({
            forceField: forceFieldRollFor(
                { rating: 30, source: 'Daemon Engine', neverOverloads: true, overloadMax: null, craftsmanship: '', bypassQualities: [] },
                50,
            ),
            righteousFury: [{ die: '1d5', dieSource: '', rolled: 3, value: 3, unaffectedBy: 'Reinforced Armour' }],
        });
        expect(parseVehicleStrike(JSON.stringify(original))).toEqual(original);
    });

    it('drops chart text a card attribute tries to carry', () => {
        const tampered = { ...strike(), righteousFury: [{ die: '1d5', dieSource: '', rolled: 2, value: 2, unaffectedBy: '', text: '<script>x</script>' }] };
        expect(parseVehicleStrike(JSON.stringify(tampered))?.righteousFury[0]).not.toHaveProperty('text');
    });

    it('rejects a missing, malformed or wrong-shaped payload', () => {
        expect(parseVehicleStrike(undefined)).toBeNull();
        expect(parseVehicleStrike('')).toBeNull();
        expect(parseVehicleStrike('{not json')).toBeNull();
        expect(parseVehicleStrike(JSON.stringify({ ...strike(), location: 'body' }))).toBeNull();
        expect(parseVehicleStrike(JSON.stringify({ ...strike(), facing: 'up' }))).toBeNull();
    });
});

describe('crewTargetOf', () => {
    const aboard = (vehicleUuid: string): object => ({ name: 'Trooper', flags: { 'wh40k-rpg': { aboard: { vehicleUuid, role: 'passenger' } } } });
    const vehicles: Record<string, { name: string; system: object }> = {
        'Actor.chimera': { name: 'Chimera', system: craftSystem([trait('Enclosed', { crewExposure: 'enclosed' })]) },
        'Actor.hectin': { name: 'Hectin Autocarriage', system: craftSystem([trait('Open-Topped', { crewExposure: 'open' })]) },
        'Actor.bike': { name: 'Bike', system: craftSystem([trait('Bike', { crewExposure: 'open', riderTargetableInMelee: true })]) },
    };
    const resolve = (uuid: string): { name: string; system: object } | null => vehicles[uuid] ?? null;

    it('shelters those inside an enclosed vehicle from outside attacks', () => {
        expect(crewTargetOf(aboard('Actor.chimera'), null, resolve)).toEqual({ targeting: 'sheltered', vehicleName: 'Chimera', riderTargetableInMelee: false });
    });

    it('exposes those in an open vehicle to a Called Shot', () => {
        expect(crewTargetOf(aboard('Actor.hectin'), null, resolve)?.targeting).toBe('calledShot');
    });

    it("carries a Bike's melee exception for the dialog to apply", () => {
        expect(crewTargetOf(aboard('Actor.bike'), null, resolve)).toMatchObject({ targeting: 'calledShot', riderTargetableInMelee: true });
    });

    it('lets crew of the same vehicle attack each other', () => {
        expect(crewTargetOf(aboard('Actor.chimera'), aboard('Actor.chimera'), resolve)?.targeting).toBe('free');
    });

    it('is null for a target not aboard a craft', () => {
        expect(crewTargetOf({ name: 'Walker', flags: {} }, null, resolve)).toBeNull();
        expect(crewTargetOf(aboard('Actor.gone'), null, resolve)).toBeNull();
    });
});
