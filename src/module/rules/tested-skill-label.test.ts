import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../testing/repo-file.ts';
import { testedSkillBaseLabel, testedSkillLabel } from './tested-skill-label.ts';

/**
 * What a test titled after something else rolled (#677): a vehicle's trait test
 * names the skill, its specialisation, and "untrained" when it applies, and the
 * base row names the characteristic and skill. Formatted through the real langpack
 * strings.
 */

const lang = JSON.parse(readRepoFile('src/lang/en.json')) as { WH40K: { Roll: { TestedSkill: Partial<Record<string, string>> } } };
const strings = lang.WH40K.Roll.TestedSkill;

/** `game.i18n.format` over the langpack's `WH40K.Roll.TestedSkill.*` strings. */
function format(key: string, data: Record<string, string>): string {
    const template = strings[key.replace('WH40K.Roll.TestedSkill.', '')];
    if (template === undefined) throw new Error(`no langpack string ${key}`);
    return template.replace(/\{(\w+)\}/g, (_match, name: string) => data[name] ?? '');
}

describe('testedSkillLabel', () => {
    it('names a specialisation rolled untrained', () => {
        expect(testedSkillLabel({ skill: 'Operate', specialisation: 'Surface', untrained: true }, format)).toBe('Operate (Surface), untrained');
    });

    it('names a trained specialisation without the untrained note', () => {
        expect(testedSkillLabel({ skill: 'Drive', specialisation: 'Ground Vehicle', untrained: false }, format)).toBe('Drive (Ground Vehicle)');
    });

    it('names a standard skill, trained or not', () => {
        expect(testedSkillLabel({ skill: 'Tech-Use', specialisation: null, untrained: false }, format)).toBe('Tech-Use');
        expect(testedSkillLabel({ skill: 'Command', specialisation: null, untrained: true }, format)).toBe('Command, untrained');
    });
});

describe('testedSkillBaseLabel', () => {
    it('names the characteristic and the skill the base comes from', () => {
        expect(testedSkillBaseLabel('Agility', 'Operate (Surface), untrained', format)).toBe('Base (Agility: Operate (Surface), untrained)');
    });
});
