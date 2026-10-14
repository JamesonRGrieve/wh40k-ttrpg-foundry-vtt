/**
 * The parry and armour qualities an evasion and a damage roll read (#414):
 * Unwieldy can't parry, Flexible can't be parried, Fast penalises the parry,
 * and Warp Weapon ignores armour no warded piece covers.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { WH40K } from '../config.ts';
import {
    armourCoveringLocation,
    attackerWeaponPreventsParry,
    canWeaponParry,
    getAttackerWeaponParryPenalty,
    warpWardingProperties,
    weaponIgnoresArmor,
    weaponParryModifiers,
    type WornArmourCandidate,
} from './weapon-quality-effects.ts';
import { setWeaponQualityPayloadsForTesting } from './weapon-quality-payloads.ts';

type QualityWeapon = Parameters<typeof canWeaponParry>[0];

function weaponWith(qualities: ReadonlyArray<string>): QualityWeapon {
    return { system: { special: new Set(qualities) } };
}

function armour(coverage: string[], properties: string[] = [], equipped = true): WornArmourCandidate {
    return { type: 'armour', system: { state: { equipped }, coverage, properties } };
}

const WARDING = new Set(['hexagrammic', 'blessed']);

afterAll(() => {
    setWeaponQualityPayloadsForTesting({});
});

describe('canWeaponParry / attackerWeaponPreventsParry', () => {
    it('an Unwieldy weapon cannot parry; others can', () => {
        expect(canWeaponParry(weaponWith(['unwieldy']))).toBe(false);
        expect(canWeaponParry(weaponWith(['balanced']))).toBe(true);
    });

    it('a Flexible attacking weapon cannot be parried', () => {
        expect(attackerWeaponPreventsParry(weaponWith(['flexible']))).toBe(true);
        expect(attackerWeaponPreventsParry(weaponWith(['tearing']))).toBe(false);
    });
});

describe('weaponParryModifiers — the parrying weapon’s own qualities (#414)', () => {
    it('one row per quality carrying a parry modifier, read off its authored mechanics', () => {
        setWeaponQualityPayloadsForTesting({ balanced: { parryBonus: 10 }, defensive: { parryBonus: 15 }, unbalanced: { parryPenalty: -10 }, tearing: {} });
        expect(weaponParryModifiers(weaponWith(['balanced', 'tearing']), 'dh2')).toEqual([{ quality: 'balanced', value: 10 }]);
        expect(weaponParryModifiers(weaponWith(['defensive', 'unbalanced']), 'bc')).toEqual([
            { quality: 'defensive', value: 15 },
            { quality: 'unbalanced', value: -10 },
        ]);
    });

    it('prefers the effective qualities (craftsmanship-derived) over the base set', () => {
        setWeaponQualityPayloadsForTesting({ balanced: { parryBonus: 10 } });
        const weapon = { system: { special: new Set<string>(), effectiveSpecial: new Set(['balanced']) } } as QualityWeapon;
        expect(weaponParryModifiers(weapon, 'rt')).toEqual([{ quality: 'balanced', value: 10 }]);
    });

    it('no weapon, or no parry qualities, puts nothing on the test', () => {
        setWeaponQualityPayloadsForTesting({ tearing: {} });
        expect(weaponParryModifiers(null, 'dh2')).toEqual([]);
        expect(weaponParryModifiers(weaponWith(['tearing']), 'dh2')).toEqual([]);
    });
});

describe('getAttackerWeaponParryPenalty', () => {
    it('reads Fast’s authored penalty (DH1 Inquisitor’s Handbook: –20)', () => {
        setWeaponQualityPayloadsForTesting({ fast: { enemyParryPenalty: -20 } });
        expect(getAttackerWeaponParryPenalty(weaponWith(['fast']), 'dh1')).toBe(-20);
        expect(getAttackerWeaponParryPenalty(weaponWith(['balanced']), 'dh1')).toBe(0);
    });

    it('is 0 when the quality authors no penalty', () => {
        setWeaponQualityPayloadsForTesting({ fast: {} });
        expect(getAttackerWeaponParryPenalty(weaponWith(['fast']), 'dh2')).toBe(0);
    });
});

describe('armourCoveringLocation', () => {
    it('collects the equipped pieces covering the location, matching any spelling', () => {
        const items = [armour(['body'], ['hexagrammic']), armour(['head']), armour(['all'], ['sealed']), armour(['body'], [], false)];
        expect(armourCoveringLocation(items, 'Body').map((p) => Array.from(p.properties))).toEqual([['hexagrammic'], ['sealed']]);
        expect(armourCoveringLocation(items, 'rightArm')).toHaveLength(1);
    });

    it('ignores items that are not armour', () => {
        expect(armourCoveringLocation([{ type: 'weapon', system: { state: { equipped: true }, coverage: ['body'], properties: [] } }], 'body')).toEqual([]);
    });
});

describe('weaponIgnoresArmor — Warp Weapon (#414)', () => {
    it('ignores unwarded armour, and a location with no armour at all', () => {
        expect(weaponIgnoresArmor(weaponWith(['warp-weapon']), [{ properties: ['sealed'] }], WARDING)).toBe(true);
        expect(weaponIgnoresArmor(weaponWith(['warp-weapon']), [], WARDING)).toBe(true);
    });

    it('is stopped by any warded or holy piece covering the location', () => {
        expect(weaponIgnoresArmor(weaponWith(['warp-weapon']), [{ properties: [] }, { properties: ['blessed'] }], WARDING)).toBe(false);
    });

    it('a weapon without Warp Weapon never ignores armour', () => {
        expect(weaponIgnoresArmor(weaponWith(['tearing']), [], WARDING)).toBe(false);
    });
});

describe('warpWardingProperties', () => {
    it('reads the wardsAgainstWarp flags off the armour-property vocabulary', () => {
        expect(warpWardingProperties({ hexagrammic: { wardsAgainstWarp: true }, sealed: {}, blessed: { wardsAgainstWarp: true } })).toEqual(
            new Set(['hexagrammic', 'blessed']),
        );
    });

    it('the system vocabulary wards with hexagrammic wards and blessing', () => {
        expect(warpWardingProperties(WH40K.armourProperties)).toEqual(new Set(['hexagrammic', 'blessed']));
    });
});
