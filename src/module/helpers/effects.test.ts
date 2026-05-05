/**
 * Tests for `effects` change-summary helpers. Cover each known change-key
 * namespace, every active-effect mode, and graceful fallback for unknown
 * keys / non-numeric values.
 */
import { describe, expect, it } from 'vitest';

import { formatChangeValue, getChangeLabel, summarizeChange, summarizeChanges } from './effects';

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
