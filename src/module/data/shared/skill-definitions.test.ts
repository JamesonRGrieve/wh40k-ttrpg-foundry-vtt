import { describe, expect, it } from 'vitest';
import { CHARACTERISTIC_SHORT_TO_FULL } from './characteristics.ts';
import { SKILL_DEFINITIONS, skillCharacteristicMap } from './skill-definitions.ts';

/**
 * The skill keys + their order are schema-significant: CreatureTemplate builds its
 * `skills` SchemaField by mapping over SKILL_DEFINITIONS, so this exact ordered key
 * list pins the generated schema shape (byte-identical to the historical inline one).
 */
const EXPECTED_KEYS_IN_ORDER = [
    'acrobatics',
    'awareness',
    'barter',
    'blather',
    'carouse',
    'charm',
    'chemUse',
    'climb',
    'command',
    'commerce',
    'concealment',
    'contortionist',
    'deceive',
    'demolition',
    'disguise',
    'dodge',
    'evaluate',
    'gamble',
    'inquiry',
    'interrogation',
    'intimidate',
    'invocation',
    'literacy',
    'logic',
    'medicae',
    'psyniscience',
    'scrutiny',
    'search',
    'security',
    'shadowing',
    'silentMove',
    'sleightOfHand',
    'survival',
    'swim',
    'tracking',
    'wrangling',
    'athletics',
    'linguistics',
    'navigate',
    'operate',
    'parry',
    'stealth',
    'ciphers',
    'commonLore',
    'drive',
    'forbiddenLore',
    'navigation',
    'performer',
    'pilot',
    'scholasticLore',
    'secretTongue',
    'speakLanguage',
    'techUse',
    'trade',
];

describe('SKILL_DEFINITIONS', () => {
    it('pins the exact catalog key set and order (schema shape guard)', () => {
        expect(Object.keys(SKILL_DEFINITIONS)).toEqual(EXPECTED_KEYS_IN_ORDER);
    });

    it('uses only known short characteristic codes', () => {
        for (const [key, d] of Object.entries(SKILL_DEFINITIONS)) {
            expect(CHARACTERISTIC_SHORT_TO_FULL[d.char], `${key} → ${d.char}`).toBeDefined();
        }
    });

    it('marks specialist groups (hasEntries) as advanced', () => {
        // Every group skill in the catalog is an advanced specialist group.
        const groupsNotAdvanced = Object.entries(SKILL_DEFINITIONS)
            .filter(([, d]) => d.hasEntries && !d.advanced)
            .map(([key]) => key);
        expect(groupsNotAdvanced).toEqual([]);
    });

    it('preserves the historical SkillField arguments for sampled skills', () => {
        expect(SKILL_DEFINITIONS['dodge']).toEqual({ label: 'Dodge', char: 'Ag', advanced: false, hasEntries: false });
        expect(SKILL_DEFINITIONS['parry']).toEqual({ label: 'Parry', char: 'WS', advanced: true, hasEntries: false });
        expect(SKILL_DEFINITIONS['commonLore']).toEqual({ label: 'Common Lore', char: 'Int', advanced: true, hasEntries: true });
        expect(SKILL_DEFINITIONS['techUse']).toEqual({ label: 'Tech-Use', char: 'Int', advanced: true, hasEntries: false });
    });
});

describe('skillCharacteristicMap', () => {
    it('derives full-name characteristics for every skill in the catalog', () => {
        const map = skillCharacteristicMap();
        expect(Object.keys(map)).toEqual(EXPECTED_KEYS_IN_ORDER);
    });

    it('resolves short codes to full keys (matches the NPC fallback expectations)', () => {
        const map = skillCharacteristicMap();
        expect(map['dodge']).toBe('agility');
        expect(map['parry']).toBe('weaponSkill');
        expect(map['medicae']).toBe('intelligence');
        expect(map['intimidate']).toBe('strength');
        expect(map['psyniscience']).toBe('perception');
    });

    it('agrees with the schema characteristic for every skill (no schema↔map drift)', () => {
        const map = skillCharacteristicMap();
        for (const [key, d] of Object.entries(SKILL_DEFINITIONS)) {
            expect(map[key]).toBe(CHARACTERISTIC_SHORT_TO_FULL[d.char]);
        }
    });
});
