import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatSkillLabel, prepareTalentModifierRows, prepareTalentSituationalRows } from './talent-display-data.ts';

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

describe('formatSkillLabel', () => {
    it('converts camelCase keys to Title Case', () => {
        expect(formatSkillLabel('commonLore')).toBe('Common Lore');
        expect(formatSkillLabel('awareness')).toBe('Awareness');
    });

    it('returns empty for an empty key', () => {
        expect(formatSkillLabel('')).toBe('');
    });
});

describe('prepareTalentModifierRows', () => {
    it('drops zero / non-numeric entries and labels each group', () => {
        const rows = prepareTalentModifierRows({
            characteristics: { weaponSkill: 10, agility: 0 },
            skills: { commonLore: -5, awareness: 'nope' }, // non-numeric value → dropped
            combat: { attack: 5 },
            resources: { fate: 0 },
        });
        expect(rows.characteristics).toEqual([{ key: 'weaponSkill', label: 'Weapon Skill', value: 10 }]);
        expect(rows.skills).toEqual([{ key: 'commonLore', label: 'Common Lore', value: -5 }]);
        expect(rows.combat).toEqual([{ key: 'attack', label: 'Attack Bonus', value: 5 }]);
        expect(rows.resources).toEqual([]); // fate is 0 → dropped
    });
});

describe('prepareTalentSituationalRows', () => {
    it('maps each situational group to labelled rows preserving condition', () => {
        const rows = prepareTalentSituationalRows({
            characteristics: [{ key: 'weaponSkill', value: 10, condition: 'when charging' }],
            skills: [{ key: 'commonLore', value: 5, condition: 'in the Imperium' }],
            combat: [{ key: 'attack', value: -10, condition: 'when prone' }],
        });
        expect(rows.characteristics).toEqual([{ key: 'weaponSkill', label: 'Weapon Skill', value: 10, condition: 'when charging' }]);
        expect(rows.skills).toEqual([{ key: 'commonLore', label: 'Common Lore', value: 5, condition: 'in the Imperium' }]);
        expect(rows.combat).toEqual([{ key: 'attack', label: 'Attack Bonus', value: -10, condition: 'when prone' }]);
    });
});
