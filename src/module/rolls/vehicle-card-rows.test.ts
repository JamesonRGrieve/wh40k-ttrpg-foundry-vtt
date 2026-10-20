import { describe, expect, it } from 'vitest';
import { resolveVehicleDamage } from '../rules/vehicle-damage.ts';
import {
    type CardLocaliser,
    stampVehicleRows,
    type VehicleCardRow,
    type VehicleDamageApplied,
    vehicleAssignCardRows,
    vehicleDamageCardRows,
} from './vehicle-card-rows.ts';
import type { VehicleStrike } from './vehicle-strike.ts';

/** Echoes each key, with its data, so a row shows exactly what it would localise. */
const echo: CardLocaliser = {
    localize: (key) => key,
    format: (key, data) => `${key}${JSON.stringify(data)}`,
};

function strike(over: Partial<VehicleStrike> = {}): VehicleStrike {
    return {
        line: 'dh2',
        facing: 'rear',
        facingAssumed: false,
        fromAboveOrBelow: false,
        location: 'hull',
        tableRoll: 23,
        tableRollKind: 'reversed',
        redirectedFrom: null,
        armourFacing: 'rear',
        forceField: null,
        righteousFury: [],
        ...over,
    };
}

function byHook(rows: readonly VehicleCardRow[], hook: string): VehicleCardRow | undefined {
    return rows.find((row) => row.hook === hook);
}

describe('vehicleDamageCardRows', () => {
    const input = { strike: strike(), facingArmour: 16, coverAP: 0, penetration: 4, damage: 25, armourIgnored: false, furies: [] };

    it('states the facing, the location and how the table was read', () => {
        const rows = vehicleDamageCardRows(input, echo);
        expect(byHook(rows, 'vehicle-facing')?.value).toBe('WH40K.Vehicle.Facing.Rear');
        expect(byHook(rows, 'vehicle-facing')?.note).toBe('WH40K.Vehicle.Damage.FacingFromPosition');
        expect(byHook(rows, 'vehicle-location')?.value).toBe('WH40K.Vehicle.Location.Hull');
        expect(byHook(rows, 'vehicle-location')?.note).toBe('WH40K.Vehicle.Damage.LocationReversed{"roll":"23"}');
    });

    it("prints the facing's armour after Penetration, with its parts on hover", () => {
        const armour = byHook(vehicleDamageCardRows(input, echo), 'vehicle-armour');
        expect(armour?.value).toBe('12');
        const tooltip = JSON.parse(armour?.tooltip ?? '{}') as { sources: { value: number }[] };
        expect(tooltip.sources.map((part) => part.value)).toEqual([16, -4]);
    });

    it('prints the Integrity damage as damage less that armour', () => {
        expect(byHook(vehicleDamageCardRows(input, echo), 'vehicle-integrity-damage')?.value).toBe('13');
    });

    it('says a Turret hit read Front armour, and why a redirected hit struck the Hull', () => {
        const turret = vehicleDamageCardRows({ ...input, strike: strike({ location: 'turret', armourFacing: 'front' }), facingArmour: 30 }, echo);
        expect(byHook(turret, 'vehicle-armour')?.note).toBe('WH40K.Vehicle.Damage.TurretFront');
        const redirected = vehicleDamageCardRows({ ...input, strike: strike({ redirectedFrom: 'turret', tableRoll: 91 }) }, echo);
        expect(byHook(redirected, 'vehicle-location')?.note).toContain('LocationRedirected');
    });

    it('names the trait force field and its roll, and zeroes a nullified hit', () => {
        const rows = vehicleDamageCardRows(
            { ...input, strike: strike({ forceField: { rating: 40, roll: 17, nullified: true, source: 'Shield Generator', overloadUnmodelled: true } }) },
            echo,
        );
        const field = byHook(rows, 'vehicle-force-field');
        expect(field?.label).toBe('Shield Generator');
        expect(field?.value).toBe('WH40K.Vehicle.Damage.ForceFieldNullified');
        expect(field?.note).toContain('ForceFieldOverload');
        expect(byHook(rows, 'vehicle-integrity-damage')?.value).toBe('0');
    });

    it('prints a Righteous Fury row with its chart text, naming the trait it bypasses', () => {
        const rows = vehicleDamageCardRows(
            {
                ...input,
                furies: [
                    {
                        die: '1d5',
                        dieSource: '',
                        rolled: 4,
                        value: 4,
                        unaffectedBy: 'Reinforced Armour',
                        critical: { chartName: 'Hull Critical Hit Effects', chartUuid: 'x', value: 4, text: '<p>Fuel leak.</p>' },
                    },
                ],
            },
            echo,
        );
        const fury = byHook(rows, 'vehicle-righteous-fury');
        expect(fury?.value).toBe('4');
        expect(fury?.html).toBe('<p>Fuel leak.</p>');
        expect(fury?.note).toContain('FuryUnaffected{"traits":"Reinforced Armour"}');
        expect(fury?.note).toContain('FuryNotCritical');
    });

    it('notes an assumed facing', () => {
        expect(byHook(vehicleDamageCardRows({ ...input, strike: strike({ facingAssumed: true }) }, echo), 'vehicle-facing')?.note).toBe(
            'WH40K.Vehicle.Damage.FacingAssumed',
        );
    });

    it('notes an attack from above or below, which reads Rear (#678)', () => {
        const facing = byHook(vehicleDamageCardRows({ ...input, strike: strike({ facing: 'rear', fromAboveOrBelow: true }) }, echo), 'vehicle-facing');
        expect({ value: facing?.value, note: facing?.note }).toEqual({ value: 'WH40K.Vehicle.Facing.Rear', note: 'WH40K.Vehicle.Damage.FacingAboveOrBelow' });
    });
});

function applied(over: Partial<VehicleDamageApplied> = {}): VehicleDamageApplied {
    return {
        facing: 'front',
        facingAssumed: false,
        fromAboveOrBelow: false,
        armourFacing: 'front',
        location: 'hull',
        outcome: resolveVehicleDamage({ damage: 47, penetration: 0, armour: 30, integrity: 10, critical: 0, critMultiplier: 0.5 }),
        integrityBefore: 10,
        integrityMax: 35,
        criticalBefore: 0,
        critSources: ['Reinforced Armour'],
        critical: { chartName: 'Hull Critical Hit Effects', chartUuid: 'x', value: 4, text: '<p>Crew shaken.</p>' },
        criticalChartMissing: false,
        nullifiedBy: null,
        righteousFury: [],
        righteousFuryLost: false,
        ...over,
    };
}

describe('vehicleAssignCardRows', () => {
    it('prints Structural Integrity before and after', () => {
        expect(byHook(vehicleAssignCardRows(applied(), echo), 'vehicle-integrity')?.value).toBe(
            'WH40K.Vehicle.Damage.IntegrityValue{"before":"10","after":"0","max":"35"}',
        );
    });

    it('prints the excess, the trait that halved it and the cumulative Critical total with its chart row', () => {
        const rows = vehicleAssignCardRows(applied(), echo);
        expect(byHook(rows, 'vehicle-excess')?.value).toBe('7');
        const multiplier = byHook(rows, 'vehicle-crit-multiplier');
        expect(multiplier?.label).toBe('Reinforced Armour');
        expect(multiplier?.value).toBe('WH40K.Vehicle.Damage.MultiplierValue{"factor":"0.5","taken":"4"}');
        const critical = byHook(rows, 'vehicle-critical');
        expect(critical?.value).toBe('WH40K.Vehicle.Damage.CriticalValue{"before":"0","taken":"4","after":"4"}');
        expect(critical?.html).toBe('<p>Crew shaken.</p>');
    });

    it('omits the Critical rows when nothing passed Integrity', () => {
        const rows = vehicleAssignCardRows(
            applied({ outcome: resolveVehicleDamage({ damage: 35, penetration: 0, armour: 30, integrity: 10, critical: 0, critMultiplier: 0.5 }) }),
            echo,
        );
        expect(byHook(rows, 'vehicle-excess')).toBeUndefined();
        expect(byHook(rows, 'vehicle-critical')).toBeUndefined();
    });

    it('says when the line carries no chart, and when Righteous Fury was lost', () => {
        const rows = vehicleAssignCardRows(applied({ critical: null, criticalChartMissing: true, righteousFuryLost: true }), echo);
        expect(byHook(rows, 'vehicle-critical')?.note).toBe('WH40K.Vehicle.Damage.ChartMissing');
        expect(byHook(rows, 'vehicle-fury-lost')?.value).toBe('WH40K.Vehicle.Damage.FuryLost');
    });
});

describe('stampVehicleRows', () => {
    const craft = {
        gameSystem: 'dh2',
        armour: { front: { value: 30 }, side: { value: 22 }, rear: { value: 16 } },
        integrity: { max: 35, value: 35, critical: 0 },
        traitEffects: { sources: {} },
    };

    function carrier(vehicleStrike: VehicleStrike | null): Parameters<typeof stampVehicleRows>[0] {
        return { vehicleStrike, coverAP: 0, totalPenetration: 0, totalDamage: 20, armourIgnored: false, vehicleRows: [], vehicleStrikeData: '' };
    }

    it("stamps a vehicle hit's rows against the struck facing's armour, and its strike for the Assign button", () => {
        const hit = carrier(strike());
        stampVehicleRows(hit, craft, []);
        expect(byHook(hit.vehicleRows, 'vehicle-armour')?.value).toBe('16');
        expect(JSON.parse(hit.vehicleStrikeData)).toMatchObject({ facing: 'rear', location: 'hull' });
    });

    it('leaves a creature hit, or a hit with no strike, alone', () => {
        const creature = carrier(strike());
        stampVehicleRows(creature, { wounds: { value: 10 } }, []);
        expect(creature.vehicleRows).toEqual([]);
        const unstruck = carrier(null);
        stampVehicleRows(unstruck, craft, []);
        expect(unstruck.vehicleStrikeData).toBe('');
    });
});
