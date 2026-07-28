import { beforeEach, describe, expect, it } from 'vitest';
import { getSpecializationsForSkill, normalizeSkillKey, setSpecializationsForTesting } from './skill-specialization-index.ts';

describe('normalizeSkillKey (#498)', () => {
    it('collapses every spelling of one skill onto the same key', () => {
        // The actor's camelCase key, the pack doc's display name and Foundry's
        // derived kebab identifier all name the same skill.
        const forms = ['commonLore', 'Common Lore', 'common-lore', 'COMMON LORE'];
        const keys = new Set(forms.map(normalizeSkillKey));
        expect(keys.size).toBe(1);
        expect([...keys][0]).toBe('commonlore');
    });

    it('keeps genuinely different skills apart', () => {
        expect(normalizeSkillKey('Common Lore')).not.toBe(normalizeSkillKey('Forbidden Lore'));
    });
});

describe('getSpecializationsForSkill', () => {
    beforeEach(() => {
        setSpecializationsForTesting({ 'Common Lore': ['Imperium', 'Adeptus Arbites'], 'Trade': ['Armourer'] }, 'dh2');
    });

    it('finds a skill by the actor’s camelCase key, not just the pack display name', () => {
        // The actor's skills live in a SchemaField keyed `commonLore`; the pack
        // document is named `Common Lore`. The lookup has to bridge that.
        expect(getSpecializationsForSkill('commonLore', 'dh2')).toEqual(['Imperium', 'Adeptus Arbites']);
    });

    it('preserves book order rather than sorting', () => {
        // The rulebook's order is the order a GM reads down the page; re-sorting
        // it alphabetically would make the picker harder to check against the book.
        expect(getSpecializationsForSkill('Common Lore', 'dh2')).toEqual(['Imperium', 'Adeptus Arbites']);
    });

    it('returns an empty list for a skill with no authored specialisations', () => {
        // Empty means "no canonical list", which the picker reads as "offer the
        // free-text field" — not as "offer an empty select".
        expect(getSpecializationsForSkill('awareness', 'dh2')).toEqual([]);
    });

    it('returns an empty list for an unknown or blank key rather than throwing', () => {
        expect(getSpecializationsForSkill('')).toEqual([]);
        expect(getSpecializationsForSkill('notASkill')).toEqual([]);
    });

    it('falls back across lines when the requested line authors none', () => {
        // A line whose skills pack is not yet authored still gets the canonical
        // list rather than nothing.
        expect(getSpecializationsForSkill('commonLore', 'ow')).toEqual(['Imperium', 'Adeptus Arbites']);
    });

    it('returns an empty list when the index was never built', () => {
        setSpecializationsForTesting({});
        expect(getSpecializationsForSkill('commonLore')).toEqual([]);
    });
});
