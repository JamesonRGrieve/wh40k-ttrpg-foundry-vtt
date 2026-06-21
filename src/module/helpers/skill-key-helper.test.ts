import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKILL_DEFINITIONS, skillAdvancedMap, skillCharacteristicShortMap, skillNameToKeyMap, specialistSkillKeys } from '../data/shared/skill-definitions.ts';
import { SkillKeyHelper } from './skill-key-helper.ts';

/**
 * Coverage for the pure SkillKeyHelper lookups (previously untested). validateKey
 * takes an actor and is excluded. The characteristic map also pins the current
 * assignments for `security` / `survival` so any future change is deliberate.
 *
 * The four lookup maps are derived from the SKILL_DEFINITIONS catalog (#273); the
 * `derived from SKILL_DEFINITIONS` block below is the no-drift guard.
 */

afterEach(() => {
    vi.restoreAllMocks();
});

describe('nameToKey / keyToName', () => {
    it('round-trips canonical display names ↔ keys', () => {
        expect(SkillKeyHelper.nameToKey('Common Lore')).toBe('commonLore');
        expect(SkillKeyHelper.nameToKey('Chem-Use')).toBe('chemUse');
        expect(SkillKeyHelper.nameToKey('Silent Move')).toBe('silentMove');
        expect(SkillKeyHelper.keyToName('commonLore')).toBe('Common Lore');
        expect(SkillKeyHelper.keyToName('chemUse')).toBe('Chem-Use');
    });

    it('slugifies an unknown name and returns the key unchanged for an unknown key', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        expect(SkillKeyHelper.nameToKey('Some Unknown-Skill')).toBe('someunknownskill');
        expect(SkillKeyHelper.nameToKey('')).toBe('');
        expect(SkillKeyHelper.keyToName('notASkill')).toBe('notASkill');
    });
});

describe('isSpecialist', () => {
    it('accepts both keys and display names', () => {
        expect(SkillKeyHelper.isSpecialist('commonLore')).toBe(true);
        expect(SkillKeyHelper.isSpecialist('Common Lore')).toBe(true);
        expect(SkillKeyHelper.isSpecialist('awareness')).toBe(false);
    });
});

describe('getCharacteristic', () => {
    it('maps skills to their characteristic abbreviation', () => {
        expect(SkillKeyHelper.getCharacteristic('dodge')).toBe('Ag');
        expect(SkillKeyHelper.getCharacteristic('Medicae')).toBe('Int');
        expect(SkillKeyHelper.getCharacteristic('charm')).toBe('Fel');
        expect(SkillKeyHelper.getCharacteristic('parry')).toBe('WS');
    });

    it('returns null for an unknown skill', () => {
        expect(SkillKeyHelper.getCharacteristic('nonsense')).toBeNull();
    });

    it('pins the current (drifted) assignments for security/survival', () => {
        // Documented drift — see project notes; pin so a future correction is intentional.
        expect(SkillKeyHelper.getCharacteristic('security')).toBe('Ag');
        expect(SkillKeyHelper.getCharacteristic('survival')).toBe('Int');
    });
});

describe('isAdvanced', () => {
    it('classifies advanced vs basic skills', () => {
        expect(SkillKeyHelper.isAdvanced('acrobatics')).toBe(true);
        expect(SkillKeyHelper.isAdvanced('commonLore')).toBe(true);
        expect(SkillKeyHelper.isAdvanced('awareness')).toBe(false);
        expect(SkillKeyHelper.isAdvanced('athletics')).toBe(false);
    });

    it('classifies the DH2e/BC/OW skills the old hand-maintained table got wrong (#273)', () => {
        // The pre-derivation literal SKILL_TYPES omitted linguistics/navigate/operate
        // entirely (→ false) and had parry as basic. The catalog corrects all four.
        expect(SkillKeyHelper.isAdvanced('parry')).toBe(true);
        expect(SkillKeyHelper.isAdvanced('linguistics')).toBe(true);
        expect(SkillKeyHelper.isAdvanced('navigate')).toBe(true);
        expect(SkillKeyHelper.isAdvanced('operate')).toBe(true);
    });

    it('returns false for an unknown skill', () => {
        expect(SkillKeyHelper.isAdvanced('nonsense')).toBe(false);
    });
});

describe('enumeration helpers', () => {
    it('lists names and keys 1:1 from the canonical map', () => {
        const names = SkillKeyHelper.getAllSkillNames();
        const keys = SkillKeyHelper.getAllSkillKeys();
        expect(names).toHaveLength(keys.length);
        expect(names).toContain('Common Lore');
        expect(keys).toContain('commonLore');
    });

    it('lists specialist keys and names', () => {
        expect(SkillKeyHelper.getAllSpecialistKeys()).toContain('commonLore');
        expect(SkillKeyHelper.getAllSpecialistNames()).toContain('Common Lore');
    });

    it('finds skills by characteristic', () => {
        const ag = SkillKeyHelper.findSkillsByCharacteristic('Ag');
        expect(ag.map((s) => s.key)).toEqual(expect.arrayContaining(['dodge', 'acrobatics']));
        expect(ag.every((s) => typeof s.name === 'string' && s.name.length > 0)).toBe(true);
    });
});

describe('getSkillMetadata', () => {
    it('returns full metadata for a known skill', () => {
        expect(SkillKeyHelper.getSkillMetadata('commonLore')).toEqual({
            key: 'commonLore',
            name: 'Common Lore',
            characteristic: 'Int',
            isAdvanced: true,
            isSpecialist: true,
        });
    });

    it('returns null for an unknown skill', () => {
        expect(SkillKeyHelper.getSkillMetadata('nonsense')).toBeNull();
    });
});

describe('derived from SKILL_DEFINITIONS (#273)', () => {
    it('SKILL_NAME_TO_KEY equals the catalog name→key map', () => {
        expect(SkillKeyHelper.SKILL_NAME_TO_KEY).toEqual(skillNameToKeyMap());
    });

    it('SPECIALIST_KEYS equals the catalog hasEntries set', () => {
        expect(SkillKeyHelper.SPECIALIST_KEYS).toEqual(specialistSkillKeys());
    });

    it('SKILL_CHARACTERISTICS equals the catalog char map', () => {
        expect(SkillKeyHelper.SKILL_CHARACTERISTICS).toEqual(skillCharacteristicShortMap());
    });

    it('SKILL_TYPES equals the catalog advanced map', () => {
        expect(SkillKeyHelper.SKILL_TYPES).toEqual(skillAdvancedMap());
    });

    it('covers every catalog skill in all four maps', () => {
        for (const [key, def] of Object.entries(SKILL_DEFINITIONS)) {
            expect(SkillKeyHelper.SKILL_NAME_TO_KEY[def.label]).toBe(key);
            expect(SkillKeyHelper.getCharacteristic(key)).toBe(def.char);
            expect(SkillKeyHelper.isAdvanced(key)).toBe(def.advanced);
            expect(SkillKeyHelper.isSpecialist(key)).toBe(def.hasEntries);
        }
    });
});
