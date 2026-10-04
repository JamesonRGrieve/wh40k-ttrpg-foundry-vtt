/**
 * Regression guard (#284): the duplicated constants in the actor sheets are
 * single-sourced.
 *  - `titleCase` was redefined six times in character-sheet.ts → one helper.
 *  - the per-rank XP-cost array `[100,250,500,750,1000]` was inline twice
 *    (base-actor-sheet + character-sheet) → one exported ADVANCE_XP_COSTS.
 *  - the NPC Type/Role dropdown maps were inline twice in npc-sheet.ts → the
 *    NPC_TYPE_OPTIONS / NPC_ROLE_OPTIONS module constants.
 *  - the 21-skill list was hard-coded three times in npc-sheet.ts → one
 *    NPC_BASIC_SKILLS list, later replaced by the per-line skill catalog
 *    (SKILL_DEFINITIONS via standardSkillsForSystem): that DH2-only list was
 *    shown on every line's NPC sheet. The sheet reads it as
 *    `system.standardSkills` from the NPC DataModel.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const CHAR = readRepoFile('src/module/applications/actor/character-sheet.ts');
const BASE = readRepoFile('src/module/applications/actor/base-actor-sheet.ts');
const NPC = readRepoFile('src/module/applications/actor/npc-sheet.ts');

const countOccurrences = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('character-sheet constant de-dup (#284)', () => {
    it('defines titleCase once at module level, not inline per method', () => {
        expect(CHAR).toContain('function titleCase(s: string): string');
        expect(CHAR).not.toContain('const titleCase = (s: string): string =>');
    });

    it('single-sources the XP-cost array via the imported ADVANCE_XP_COSTS', () => {
        expect(CHAR).toContain('ADVANCE_XP_COSTS');
        expect(countOccurrences(CHAR, '[100, 250, 500, 750, 1000]')).toBe(0);
    });
});

describe('base-actor-sheet XP-cost source (#284)', () => {
    it('exports the single ADVANCE_XP_COSTS array and uses it', () => {
        expect(BASE).toContain('export const ADVANCE_XP_COSTS = [100, 250, 500, 750, 1000]');
        expect(BASE).toContain('ADVANCE_XP_COSTS[nextAdvance]');
    });
});

describe('npc-sheet constant de-dup (#284, options updated by #257)', () => {
    it('declares the NPC tier/nature option builders once', () => {
        // #257 split the overloaded NPC type into tier + nature (role dropped). The
        // options are builders, not constants: their labels are langpack keys
        // localized at render time (the langpack is not loaded at module load).
        expect(countOccurrences(NPC, 'const npcTierOptions = ')).toBe(1);
        expect(countOccurrences(NPC, 'const npcNatureOptions = ')).toBe(1);
        expect(NPC).not.toContain('NPC_ROLE_OPTIONS');
    });

    it('builds the tier/nature options from the one builder for both the context and the header', () => {
        expect(NPC).toContain("context['npcTierOptions'] = npcTierOptions()");
        expect(NPC).toContain("context['npcNatureOptions'] = npcNatureOptions()");
        expect(NPC).toContain('options: npcTierOptions()');
        expect(NPC).toContain('options: npcNatureOptions()');
    });

    it('holds no skill list of its own; every projection derives from the per-line catalog', () => {
        expect(NPC).not.toContain('NPC_BASIC_SKILLS');
        expect(NPC).not.toContain("'Sleight of Hand'");
        // The catalog is read through the DataModel (sheets must not import data/):
        // skills tab + add-skill picker.
        expect(NPC).not.toContain('skill-definitions');
        expect(countOccurrences(NPC, 'system.standardSkills')).toBe(2);
    });
});
