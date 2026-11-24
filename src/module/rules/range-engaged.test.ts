import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeaponRollData } from '../rolls/roll-data.ts';
import { calculateWeaponRange } from './range.ts';

/** A pistol shot (30 m) at `distance` metres, engaged with the target or not. */
function pistolShot(distance: number, engagedWithTarget: boolean): WeaponRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test the range calculation
    const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
    rd.modifiers = {};
    rd.chosenQualities = [];
    rd.weaponModifications = [];
    rd.distance = distance;
    rd.engagedWithTarget = engagedWithTarget;
    // eslint-disable-next-line no-restricted-syntax -- test: a synthetic shooter reduced to the surface the range calculation reads
    rd.sourceActor = { type: 'dh2-character', token: null, getCharacteristicFuzzy: () => undefined } as unknown as WeaponRollData['sourceActor'];
    // eslint-disable-next-line no-restricted-syntax -- test: the weapon is reduced to the fields the range calculation reads
    rd.weapon = { isMelee: false, system: { attack: { range: { value: 30, special: '' } } } } as unknown as WeaponRollData['weapon'];
    return rd;
}

describe("Point Blank when engaged with the target (#804, RAW: the bonus doesn't apply)", () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('a pistol at 1 m, not engaged with the target: Point Blank +30', () => {
        const rd = pistolShot(1, false);
        calculateWeaponRange(rd);
        expect(rd.rangeBonus).toBe(30);
    });

    it('a pistol at the foe it is engaged with: Point Blank, but no bonus, and the card says why', () => {
        const rd = pistolShot(1, true);
        calculateWeaponRange(rd);
        expect(rd.rangeBonus).toBe(0);
        expect((rd as WeaponRollData & { rangeModifiedBy?: string }).rangeModifiedBy).toBe('WH40K.Roll.Engagement.NoPointBlank');
    });

    it('engagement changes nothing beyond Point Blank range', () => {
        const near = pistolShot(10, true);
        calculateWeaponRange(near);
        const free = pistolShot(10, false);
        calculateWeaponRange(free);
        expect(near.rangeBonus).toBe(free.rangeBonus);
    });
});
