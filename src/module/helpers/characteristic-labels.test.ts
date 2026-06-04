import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { characteristicAbbrev, characteristicLabel, combatLabel, formatCharacteristicMods, formatWounds, resourceLabel } from './characteristic-labels.ts';

/** Minimal CONFIG.wh40k stub exposing only the tables these helpers read. */
const I18N: Record<string, string> = {
    'WH40K.Characteristic.WeaponSkill': 'Weapon Skill',
    'WH40K.Characteristic.Agility': 'Agility',
    'WH40K.Combat.AttackBonus': 'Attack Bonus',
    'WH40K.Resource.FatePoints': 'Fate Points',
};

beforeEach(() => {
    vi.stubGlobal('CONFIG', {
        wh40k: {
            characteristics: {
                weaponSkill: { label: 'WH40K.Characteristic.WeaponSkill', abbreviation: 'WS' },
                agility: { label: 'WH40K.Characteristic.Agility', abbreviation: 'Ag' },
            },
            combatBonuses: { attack: { label: 'WH40K.Combat.AttackBonus' } },
            resources: { fate: { label: 'WH40K.Resource.FatePoints' } },
        },
    });
    vi.stubGlobal('game', { i18n: { localize: (key: string) => I18N[key] ?? key } });
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('characteristicLabel / characteristicAbbrev', () => {
    it('resolves a known characteristic to its localized label + abbreviation', () => {
        expect(characteristicLabel('weaponSkill')).toBe('Weapon Skill');
        expect(characteristicAbbrev('weaponSkill')).toBe('WS');
    });

    it('falls back for unknown keys (raw key / first-3 upper)', () => {
        expect(characteristicLabel('unknownKey')).toBe('unknownKey');
        expect(characteristicAbbrev('unknownKey')).toBe('UNK');
    });
});

describe('combatLabel / resourceLabel', () => {
    it('resolves known keys to their localized labels', () => {
        expect(combatLabel('attack')).toBe('Attack Bonus');
        expect(resourceLabel('fate')).toBe('Fate Points');
    });

    it('capitalizes unknown keys', () => {
        expect(combatLabel('parry')).toBe('Parry');
        expect(resourceLabel('sanity')).toBe('Sanity');
    });
});

describe('formatCharacteristicMods', () => {
    it('prefixes positives with + and negatives with the U+2212 minus, all localized', () => {
        expect(formatCharacteristicMods(['weaponSkill'], ['agility'])).toBe('+Weapon Skill, −Agility');
    });

    it('handles one-sided lists', () => {
        expect(formatCharacteristicMods(['agility'], [])).toBe('+Agility');
        expect(formatCharacteristicMods([], ['weaponSkill'])).toBe('−Weapon Skill');
    });
});

describe('formatWounds', () => {
    it('formats a flat + dice expression', () => {
        expect(formatWounds(8, 1, 10)).toBe('8 + 1d10');
        expect(formatWounds(7, 2, 5)).toBe('7 + 2d5');
    });
});
