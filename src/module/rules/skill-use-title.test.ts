import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SKILL_DEFINITIONS, skillLabel } from '../data/shared/skill-definitions.ts';
import { getSkillUses, skillUseTitle } from './skill-uses.ts';

/**
 * A skill-use roll's card title (#671): the general test is "<Skill> Test", any other
 * use "<Skill>: <Use>", and a use whose label adds nothing to the skill's shows the
 * skill once (Charm's social use, labelled "Charm", read "CHARM: CHARM").
 */

/** The langpack: nested groups whose leaves are strings. */
interface LangTree {
    [key: string]: string | LangTree;
}

const LANG = JSON.parse(readFileSync(resolve(__dirname, '../../lang/en.json'), 'utf8')) as LangTree;

/** A langpack key's English text (the key itself when it is missing). */
function localize(key: string): string {
    let node: string | LangTree = LANG;
    for (const part of key.split('.')) {
        if (typeof node === 'string') return key;
        const next: string | LangTree | undefined = Object.entries(node).find(([name]) => name === part)?.[1];
        if (next === undefined) return key;
        node = next;
    }
    return typeof node === 'string' ? node : key;
}

describe('skillUseTitle (#671)', () => {
    it('a general use is the skill test', () => {
        expect(skillUseTitle('general', 'Charm', 'General Test')).toBe('Charm Test');
    });

    it('a use with its own label names the skill and the use', () => {
        expect(skillUseTitle('social', 'Wrangling', 'Wrangle Beast')).toBe('Wrangling: Wrangle Beast');
        expect(skillUseTitle('inspire', 'Charm', 'Inspire')).toBe('Charm: Inspire');
    });

    it('a use labelled as the skill shows the skill once', () => {
        expect(skillUseTitle('social', 'Charm', 'Charm')).toBe('Charm');
        expect(skillUseTitle('social', 'Deceive', ' deceive ')).toBe('Deceive');
    });
});

describe('every skill use in the catalogue (#671)', () => {
    const uses = Object.keys(SKILL_DEFINITIONS).flatMap((key) =>
        getSkillUses(key)
            .filter((use) => use.kind !== 'general')
            .map((use) => ({ key, id: use.id, kind: use.kind, skill: skillLabel(key), label: localize(use.labelKey) })),
    );

    it('the uses labelled as their skill are Charm, Command, Intimidate and Deceive (social) and Blather (Blather)', () => {
        const same = uses.filter((use) => use.label.toLocaleLowerCase() === use.skill.toLocaleLowerCase()).map((use) => `${use.key}/${use.id}`);
        expect(same.sort()).toEqual(['blather/blather', 'charm/social', 'command/social', 'deceive/social', 'intimidate/social']);
    });

    it('no title repeats its skill', () => {
        const repeated = uses.filter(
            (use) => skillUseTitle(use.kind, use.skill, use.label).toLocaleLowerCase() === `${use.skill}: ${use.skill}`.toLocaleLowerCase(),
        );
        expect(repeated).toEqual([]);
    });
});
