import { describe, expect, it } from 'vitest';
import {
    activeFiringMode,
    applyModeQualities,
    hasFiringModes,
    modeAttackType,
    modeCharacteristic,
    modeDamageBonus,
    modeDamageFormula,
    modePenetration,
    modeRange,
    modeRateOfFire,
    modeWeaponClass,
    type WeaponFiringMode,
} from './weapon-modes';

function mode(over: Partial<WeaponFiringMode> = {}): WeaponFiringMode {
    return {
        label: 'X',
        damage: '',
        damageBonus: null,
        penetration: null,
        range: null,
        addedQualities: [],
        removedQualities: [],
        weaponClass: '',
        attackType: '',
        characteristic: '',
        rateOfFire: null,
        ...over,
    };
}

describe('weapon firing modes (#430)', () => {
    describe('hasFiringModes', () => {
        it('false for none / null / empty', () => {
            expect(hasFiringModes(undefined)).toBe(false);
            expect(hasFiringModes(null)).toBe(false);
            expect(hasFiringModes([])).toBe(false);
        });
        it('true when at least one mode is present', () => {
            expect(hasFiringModes([mode()])).toBe(true);
        });
    });

    describe('activeFiringMode', () => {
        const modes = [mode({ label: 'A' }), mode({ label: 'B' })];
        it('null when the weapon has no modes', () => {
            expect(activeFiringMode([], 0)).toBeNull();
            expect(activeFiringMode(undefined, 0)).toBeNull();
        });
        it('returns the mode at the index', () => {
            expect(activeFiringMode(modes, 0)?.label).toBe('A');
            expect(activeFiringMode(modes, 1)?.label).toBe('B');
        });
        it('clamps an out-of-range or non-integer index', () => {
            expect(activeFiringMode(modes, 5)?.label).toBe('B');
            expect(activeFiringMode(modes, -3)?.label).toBe('A');
            expect(activeFiringMode(modes, 1.9)?.label).toBe('A'); // non-integer → index 0
        });
    });

    describe('applyModeQualities', () => {
        it('no-op for a null mode', () => {
            expect([...applyModeQualities(new Set(['a']), null)]).toEqual(['a']);
        });
        it('adds and removes qualities without mutating the input', () => {
            const q = new Set(['tearing', 'overheats']);
            const out = applyModeQualities(q, mode({ addedQualities: ['scatter'], removedQualities: ['overheats'] }));
            expect(out.has('scatter')).toBe(true);
            expect(out.has('overheats')).toBe(false);
            expect(out.has('tearing')).toBe(true);
            expect([...q]).toEqual(['tearing', 'overheats']); // input untouched
        });
    });

    describe('stat overrides inherit the base unless the mode sets them', () => {
        it('damage formula', () => {
            expect(modeDamageFormula(null, '1d10')).toBe('1d10');
            expect(modeDamageFormula(mode({ damage: '' }), '1d10')).toBe('1d10');
            expect(modeDamageFormula(mode({ damage: '2d10+4' }), '1d10')).toBe('2d10+4');
        });
        it('damage bonus (explicit 0 overrides, null inherits)', () => {
            expect(modeDamageBonus(null, 8)).toBe(8);
            expect(modeDamageBonus(mode({ damageBonus: null }), 8)).toBe(8);
            expect(modeDamageBonus(mode({ damageBonus: 4 }), 8)).toBe(4);
            expect(modeDamageBonus(mode({ damageBonus: 0 }), 8)).toBe(0);
        });
        it('penetration (explicit 0 overrides, null inherits)', () => {
            expect(modePenetration(null, 3)).toBe(3);
            expect(modePenetration(mode({ penetration: null }), 3)).toBe(3);
            expect(modePenetration(mode({ penetration: 12 }), 3)).toBe(12);
            expect(modePenetration(mode({ penetration: 0 }), 3)).toBe(0);
        });
        it('range', () => {
            expect(modeRange(null, 10)).toBe(10);
            expect(modeRange(mode({ range: null }), 10)).toBe(10);
            expect(modeRange(mode({ range: 5 }), 10)).toBe(5);
        });
    });

    it('models the mining melta Focused (5m, overheats) vs Broad (10m, scatter) split', () => {
        const modes = [
            mode({ label: 'Focused', range: 5, addedQualities: ['overheats'], removedQualities: ['scatter'] }),
            mode({ label: 'Broad', range: 10, addedQualities: ['scatter'], removedQualities: ['overheats'] }),
        ];
        const baseQ = new Set<string>();
        const focused = activeFiringMode(modes, 0);
        const broad = activeFiringMode(modes, 1);
        expect(modeRange(focused, 0)).toBe(5);
        expect([...applyModeQualities(baseQ, focused)]).toEqual(['overheats']);
        expect(modeRange(broad, 0)).toBe(10);
        expect([...applyModeQualities(baseQ, broad)]).toEqual(['scatter']);
    });

    describe('melee↔ranged mode overrides (#430 extension)', () => {
        it('modeWeaponClass overrides the class, inheriting on "" or null mode', () => {
            expect(modeWeaponClass(mode({ weaponClass: 'melee' }), 'basic')).toBe('melee');
            expect(modeWeaponClass(mode({ weaponClass: '' }), 'basic')).toBe('basic'); // inherit
            expect(modeWeaponClass(null, 'basic')).toBe('basic');
        });

        it('modeAttackType / modeCharacteristic override, inheriting on ""', () => {
            expect(modeAttackType(mode({ attackType: 'melee' }), 'ranged')).toBe('melee');
            expect(modeAttackType(mode({ attackType: '' }), 'ranged')).toBe('ranged');
            expect(modeCharacteristic(mode({ characteristic: 'weaponSkill' }), 'ballisticSkill')).toBe('weaponSkill');
            expect(modeCharacteristic(mode({ characteristic: '' }), 'ballisticSkill')).toBe('ballisticSkill');
        });

        it('modeRateOfFire overrides, inheriting on null', () => {
            const base = { single: true, semi: 3, full: 6 };
            expect(modeRateOfFire(mode({ rateOfFire: { single: false, semi: 0, full: 0 } }), base)).toEqual({ single: false, semi: 0, full: 0 });
            expect(modeRateOfFire(mode({ rateOfFire: null }), base)).toBe(base); // inherit
            expect(modeRateOfFire(null, base)).toBe(base);
        });

        it('models a dual-natured weapon (Burna): a melee mode and a ranged mode', () => {
            // Ranged mode is the base (BS, class basic, RoF single); melee mode
            // switches to WS/class melee/no RoF and a power-field cutting profile.
            const modes = [
                mode({ label: 'Ranged' }), // inherits the base ranged profile
                mode({
                    label: 'Melee',
                    weaponClass: 'melee',
                    attackType: 'melee',
                    characteristic: 'weaponSkill',
                    rateOfFire: { single: false, semi: 0, full: 0 },
                    damage: '1d10',
                    damageBonus: 5,
                    penetration: 5,
                }),
            ];
            const ranged = activeFiringMode(modes, 0);
            const melee = activeFiringMode(modes, 1);
            expect(modeWeaponClass(ranged, 'basic')).toBe('basic');
            expect(modeWeaponClass(melee, 'basic')).toBe('melee');
            expect(modeCharacteristic(melee, 'ballisticSkill')).toBe('weaponSkill');
            expect(modeDamageFormula(melee, '1d10')).toBe('1d10');
            expect(modePenetration(melee, 2)).toBe(5);
        });
    });
});
