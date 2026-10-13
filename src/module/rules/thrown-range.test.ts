import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WeaponRollData } from '../rolls/roll-data.ts';
import { calculateWeaponRange } from './range.ts';
import { strengthBonusRangeFactor, thrownRangeMetres } from './thrown-range.ts';

describe('strengthBonusRangeFactor — the printed SBx<N> range (#604)', () => {
    it('reads every printed Strength-Bonus form in the packs', () => {
        expect(strengthBonusRangeFactor('SBx3')).toBe(3);
        expect(strengthBonusRangeFactor('SBx4')).toBe(4);
        expect(strengthBonusRangeFactor('SBx8')).toBe(8);
        expect(strengthBonusRangeFactor('SB x 2')).toBe(2);
        expect(strengthBonusRangeFactor('SB×3')).toBe(3);
        expect(strengthBonusRangeFactor('SBx1m (when thrown)')).toBe(1);
    });

    it('is null for a range that is not Strength-Bonus based', () => {
        for (const printed of ['', 'Thrown 3m', 'Short', '50-300m', 'WPBx5m', '3d10m', 'also thrown 10m']) expect(strengthBonusRangeFactor(printed)).toBeNull();
        expect(strengthBonusRangeFactor(30)).toBeNull();
        expect(strengthBonusRangeFactor(undefined)).toBeNull();
        expect(strengthBonusRangeFactor('SBx0')).toBeNull();
    });
});

describe('thrownRangeMetres (#604)', () => {
    it('is the multiple times the Strength Bonus', () => {
        expect(thrownRangeMetres(3, 4)).toBe(12);
        expect(thrownRangeMetres(1, 5)).toBe(5);
    });

    it('a Strength Bonus of 0 (or below) throws nowhere', () => {
        expect(thrownRangeMetres(3, 0)).toBe(0);
        expect(thrownRangeMetres(3, -1)).toBe(0);
    });
});

/** A thrower with Strength Bonus `sb` in a `line` scene whose environment flag is `environment`. */
function thrower(line: string, sb: number, environment: object): WeaponRollData['sourceActor'] {
    const actor = {
        type: `${line}-character`,
        token: { parent: { getFlag: () => environment } },
        getCharacteristicFuzzy: (key: string) => (key === 'strength' ? { bonus: sb, effectiveBonus: sb } : undefined),
    };
    // eslint-disable-next-line no-restricted-syntax -- test: a synthetic token actor reduced to the surface the range calculation reads (type, token scene flag, Strength)
    return actor as unknown as WeaponRollData['sourceActor'];
}

/** A weapon roll for a non-melee weapon whose printed range is `special` (or a flat `value`). */
function throwRoll(range: { value: number; special: string }, actor: WeaponRollData['sourceActor']): WeaponRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to unit-test the range calculation
    const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
    rd.modifiers = {};
    rd.chosenQualities = [];
    rd.weaponModifications = [];
    rd.distance = 0;
    rd.sourceActor = actor;
    // eslint-disable-next-line no-restricted-syntax -- test: the weapon is reduced to the fields the range calculation reads
    rd.weapon = { isMelee: false, system: { attack: { range } } } as unknown as WeaponRollData['weapon'];
    return rd;
}

describe('calculateWeaponRange — a thrown weapon ranges off the thrower’s Strength Bonus (#604)', () => {
    beforeEach(() => {
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key, format: (key: string) => key } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('SBx3 with SB 4 reaches 12 m in standard gravity, in every line', () => {
        for (const line of ['dh1', 'dh2', 'rt', 'dw', 'bc', 'ow']) {
            const rd = throwRoll({ value: 0, special: 'SBx3' }, thrower(line, 4, {}));
            calculateWeaponRange(rd);
            expect(rd.maxRange).toBe(12);
        }
    });

    it('low gravity throws with SB +2; high gravity with SB −2, to a minimum of 0', () => {
        const low = throwRoll({ value: 0, special: 'SBx3' }, thrower('dh2', 4, { gravity: 'low' }));
        calculateWeaponRange(low);
        expect(low.maxRange).toBe(18);
        const high = throwRoll({ value: 0, special: 'SBx3' }, thrower('rt', 4, { gravity: 'high' }));
        calculateWeaponRange(high);
        expect(high.maxRange).toBe(6);
        const weak = throwRoll({ value: 0, special: 'SBx3' }, thrower('ow', 1, { gravity: 'high' }));
        calculateWeaponRange(weak);
        expect(weak.maxRange).toBe(0);
    });

    it('an unmodelled line takes no gravity change', () => {
        const rd = throwRoll({ value: 0, special: 'SBx3' }, thrower('im', 4, { gravity: 'low' }));
        calculateWeaponRange(rd);
        expect(rd.maxRange).toBe(12);
    });

    it('a flat printed range is untouched by Strength or gravity', () => {
        const rd = throwRoll({ value: 30, special: '' }, thrower('dh2', 4, { gravity: 'low' }));
        calculateWeaponRange(rd);
        expect(rd.maxRange).toBe(30);
    });
});
