import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleHitLocationBand } from '../rules/vehicle-damage.ts';
import { Hit } from './damage-data.ts';
import type { VehicleTargetProfile } from './vehicle-strike.ts';

/** Table 7-29 as DH2 prints it. */
const BANDS: VehicleHitLocationBand[] = [
    { max: 20, location: 'motive' },
    { max: 60, location: 'hull' },
    { max: 80, location: 'weapon' },
    { max: 100, location: 'turret' },
];

function profile(over: Partial<VehicleTargetProfile> = {}): VehicleTargetProfile {
    return {
        line: 'dh2',
        rules: { hitLocations: BANDS, righteousFuryDie: '1d5', righteousFuryNeedsDamage: false },
        facing: 'rear',
        facingAssumed: false,
        fromAboveOrBelow: false,
        incomingToHit: [],
        motion: { moving: false, airborne: false, mobile: true },
        mounts: { hasTurret: true, weaponFacings: ['all'] },
        forceField: null,
        righteousFuryDie: '1d5',
        righteousFuryDieSource: '',
        critMultiplier: null,
        critExcludesRighteousFury: false,
        critMultiplierSources: [],
        ...over,
    };
}

/** Each `new Roll(formula)` evaluates to the next queued total. */
let queued: number[] = [];
let formulas: string[] = [];

class StubRoll {
    formula: string;
    total: number | undefined = undefined;
    constructor(formula: string) {
        this.formula = formula;
        formulas.push(formula);
    }
    async evaluate(): Promise<this> {
        this.total = queued.shift() ?? 0;
        return Promise.resolve(this);
    }
}

describe('Hit.strikeVehicle (content#28)', () => {
    beforeEach(() => {
        queued = [];
        formulas = [];
        vi.stubGlobal('Roll', StubRoll);
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('reads the first hit off the reversed attack roll (32 → 23: the Hull)', async () => {
        const hit = new Hit();
        await hit.strikeVehicle(32, 0, profile());
        expect(hit.location).toBe('hull');
        expect(hit.vehicleStrike).toMatchObject({ tableRoll: 23, tableRollKind: 'reversed', facing: 'rear', armourFacing: 'rear' });
    });

    it('rolls a fresh d100 for an extra hit on the same vehicle', async () => {
        queued = [88];
        const hit = new Hit();
        await hit.strikeVehicle(32, 1, profile());
        expect(formulas).toEqual(['1d100']);
        expect(hit.vehicleStrike).toMatchObject({ location: 'turret', tableRoll: 88, tableRollKind: 'fresh', armourFacing: 'front' });
    });

    it('strikes the Hull with no table roll on a line with one chart', async () => {
        const hit = new Hit();
        await hit.strikeVehicle(32, 2, profile({ rules: { hitLocations: null, righteousFuryDie: '1d5', righteousFuryNeedsDamage: false } }));
        expect(formulas).toEqual([]);
        expect(hit.vehicleStrike).toMatchObject({ location: 'hull', tableRollKind: 'none' });
    });

    it("turns Righteous Fury into a vehicle chart roll, not a creature's Critical Effect", async () => {
        const hit = new Hit();
        // eslint-disable-next-line no-restricted-syntax -- test: a Righteous Fury trigger's pre-rolled 1d5, reduced to its total
        hit.righteousFury = [{ roll: { total: 4 } as unknown as Roll, effect: 'creature effect' }];
        await hit.strikeVehicle(45, 0, profile({ critMultiplier: 0.5, critExcludesRighteousFury: true, critMultiplierSources: ['Reinforced Armour'] }));
        expect(hit.righteousFury[0]?.effect).toBe('');
        expect(hit.vehicleStrike?.righteousFury).toEqual([{ die: '1d5', dieSource: '', rolled: 4, value: 4, unaffectedBy: 'Reinforced Armour' }]);
    });

    it("rolls a trait's Righteous Fury die instead (Ramshackle 1d10)", async () => {
        queued = [9];
        const hit = new Hit();
        // eslint-disable-next-line no-restricted-syntax -- test: a Righteous Fury trigger's pre-rolled 1d5, reduced to its total
        hit.righteousFury = [{ roll: { total: 2 } as unknown as Roll, effect: '' }];
        await hit.strikeVehicle(45, 0, profile({ righteousFuryDie: '1d10', righteousFuryDieSource: 'Ramshackle' }));
        expect(formulas).toEqual(['1d10']);
        expect(hit.vehicleStrike?.righteousFury[0]).toMatchObject({ die: '1d10', dieSource: 'Ramshackle', rolled: 9, value: 9 });
    });
});
