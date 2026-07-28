/**
 * Tests for `effects` change-summary helpers. Cover each known change-key
 * namespace, every active-effect mode, and graceful fallback for unknown
 * keys / non-numeric values.
 */
import { describe, expect, it } from 'vitest';
import { changeType, formatChangeValue, getChangeLabel, summarizeChange, summarizeChanges } from './effects';

describe('changeType — V14 string over deprecated numeric mode (#507)', () => {
    it('prefers the string `type`', () => {
        // `mode` is deliberately contradictory: if it were consulted the answer
        // would be 'add', so 'override' proves the string wins.
        expect(changeType({ key: 'k', type: 'override', mode: 2, value: 1 })).toBe('override');
    });

    it('falls back to the legacy numeric mode for pre-V14 world data', () => {
        const legacy = [
            [0, 'custom'],
            [1, 'multiply'],
            [2, 'add'],
            [3, 'downgrade'],
            [4, 'upgrade'],
            [5, 'override'],
        ] as const;
        for (const [mode, expected] of legacy) {
            expect(changeType({ key: 'k', mode, value: 1 })).toBe(expected);
        }
    });

    it('returns null when neither form is set, rather than guessing a type', () => {
        expect(changeType({ key: 'k', value: 1 })).toBeNull();
        expect(changeType({ key: 'k', mode: 99, value: 1 })).toBeNull();
    });

    it('never READS `mode` when `type` is present', () => {
        // The property access itself is what logs the Foundry deprecation, so a
        // throwing getter proves the string path never touches it.
        const trap = {
            key: 'k',
            value: 10,
            type: 'add' as const,
            get mode(): number {
                throw new Error('read the deprecated numeric mode');
            },
        };
        expect(() => formatChangeValue(trap)).not.toThrow();
        expect(formatChangeValue(trap)).toBe('+10');
    });
});

describe('formatChangeValue — V14 string form (#507)', () => {
    it('formats every type', () => {
        expect(formatChangeValue({ key: 'k', type: 'add', value: 10 })).toBe('+10');
        expect(formatChangeValue({ key: 'k', type: 'add', value: -20 })).toBe('-20');
        expect(formatChangeValue({ key: 'k', type: 'multiply', value: 2 })).toBe('×2');
        expect(formatChangeValue({ key: 'k', type: 'override', value: 40 })).toBe('= 40');
        expect(formatChangeValue({ key: 'k', type: 'upgrade', value: 5 })).toBe('↑5');
        expect(formatChangeValue({ key: 'k', type: 'downgrade', value: 5 })).toBe('↓5');
        expect(formatChangeValue({ key: 'k', type: 'custom', value: 'weird' })).toBe('weird');
    });

    it('agrees with the legacy numeric form row for row', () => {
        const pairs = [
            ['add', 2],
            ['multiply', 1],
            ['override', 5],
            ['upgrade', 4],
            ['downgrade', 3],
        ] as const;
        for (const [type, mode] of pairs) {
            expect(formatChangeValue({ key: 'k', type, value: 7 })).toBe(formatChangeValue({ key: 'k', mode, value: 7 }));
        }
    });
});

describe('getChangeLabel', () => {
    it('resolves characteristic keys via the localization fallback', () => {
        expect(getChangeLabel('system.characteristics.strength.modifier')).toBe('WH40K.Characteristic.Strength');
        expect(getChangeLabel('system.characteristics.weaponSkill.value')).toBe('WH40K.Characteristic.WeaponSkill');
    });

    it('resolves skill keys', () => {
        expect(getChangeLabel('system.skills.acrobatics.bonus')).toBe('WH40K.Skill.acrobatics');
    });

    it('resolves combat keys with capitalization', () => {
        expect(getChangeLabel('system.combat.weaponSkill.bonus')).toBe('WH40K.Combat.WeaponSkill');
    });

    it('resolves movement keys with capitalization', () => {
        expect(getChangeLabel('system.movement.run.bonus')).toBe('WH40K.Movement.Run');
    });

    it('falls back to the capitalized last segment for unknown namespaces', () => {
        expect(getChangeLabel('system.misc.luck')).toBe('Luck');
        expect(getChangeLabel('flags.wh40k-rpg.tag')).toBe('Tag');
    });

    it('handles the empty string without throwing', () => {
        expect(getChangeLabel('')).toBe('');
    });
});

describe('formatChangeValue', () => {
    it('formats ADD with explicit sign', () => {
        expect(formatChangeValue({ key: 'k', mode: 2, value: 5 })).toBe('+5');
        expect(formatChangeValue({ key: 'k', mode: 2, value: -3 })).toBe('-3');
        expect(formatChangeValue({ key: 'k', mode: 2, value: 0 })).toBe('0');
    });

    it('formats MULTIPLY with the × glyph', () => {
        expect(formatChangeValue({ key: 'k', mode: 1, value: 2 })).toBe('×2');
    });

    it('formats OVERRIDE with =', () => {
        expect(formatChangeValue({ key: 'k', mode: 5, value: 10 })).toBe('= 10');
    });

    it('formats UPGRADE / DOWNGRADE with arrows', () => {
        expect(formatChangeValue({ key: 'k', mode: 4, value: 7 })).toBe('↑7');
        expect(formatChangeValue({ key: 'k', mode: 3, value: 7 })).toBe('↓7');
    });

    it('returns the raw value for CUSTOM mode', () => {
        expect(formatChangeValue({ key: 'k', mode: 0, value: 'custom' })).toBe('custom');
    });

    it('treats non-numeric values as 0 in numeric modes', () => {
        // Number('abc') is NaN -> falls through to 0 with sign branch
        expect(formatChangeValue({ key: 'k', mode: 2, value: 'abc' })).toBe('0');
    });
});

describe('summarizeChange', () => {
    it('combines label and value into the canonical row shape', () => {
        const out = summarizeChange({ key: 'system.characteristics.agility.modifier', mode: 2, value: 5 });
        expect(out).toEqual({ label: 'WH40K.Characteristic.Agility', value: '+5' });
    });
});

describe('summarizeChanges', () => {
    it('returns an empty array for undefined / empty input', () => {
        expect(summarizeChanges(undefined)).toEqual([]);
        expect(summarizeChanges([])).toEqual([]);
    });

    it('maps each change row through summarizeChange', () => {
        const out = summarizeChanges([
            { key: 'system.skills.acrobatics.bonus', mode: 2, value: 10 },
            { key: 'system.movement.run.bonus', mode: 1, value: 2 },
        ]);
        expect(out).toEqual([
            { label: 'WH40K.Skill.acrobatics', value: '+10' },
            { label: 'WH40K.Movement.Run', value: '×2' },
        ]);
    });
});
