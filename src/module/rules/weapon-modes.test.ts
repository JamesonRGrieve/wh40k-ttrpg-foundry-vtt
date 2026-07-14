import { describe, expect, it } from 'vitest';
import {
    activeFiringMode,
    applyModeQualities,
    hasFiringModes,
    modeDamageBonus,
    modeDamageFormula,
    modePenetration,
    modeRange,
    type WeaponFiringMode,
} from './weapon-modes';

function mode(over: Partial<WeaponFiringMode> = {}): WeaponFiringMode {
    return { label: 'X', damage: '', damageBonus: null, penetration: null, range: null, addedQualities: [], removedQualities: [], ...over };
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
});
