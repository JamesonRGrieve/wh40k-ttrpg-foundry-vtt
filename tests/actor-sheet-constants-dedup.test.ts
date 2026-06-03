/**
 * Regression guard (#284): the duplicated constants in the actor sheets are
 * single-sourced.
 *  - `titleCase` was redefined six times in character-sheet.ts → one helper.
 *  - the per-rank XP-cost array `[100,250,500,750,1000]` was inline twice
 *    (base-actor-sheet + character-sheet) → one exported ADVANCE_XP_COSTS.
 *  - the NPC Type/Role dropdown maps were inline twice in npc-sheet.ts → the
 *    NPC_TYPE_OPTIONS / NPC_ROLE_OPTIONS module constants.
 *  - the 21-skill list was hard-coded three times in npc-sheet.ts → the
 *    NPC_BASIC_SKILLS canonical list, the other two projections derive from it.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string): string => readFileSync(resolve(__dirname, '..', p), 'utf8');
const CHAR = read('src/module/applications/actor/character-sheet.ts');
const BASE = read('src/module/applications/actor/base-actor-sheet.ts');
const NPC = read('src/module/applications/actor/npc-sheet.ts');

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
    it('declares the NPC tier/nature option + skill constants once', () => {
        // #257 split the overloaded NPC type into tier + nature (role dropped).
        expect(NPC).toContain('const NPC_TIER_OPTIONS');
        expect(NPC).toContain('const NPC_NATURE_OPTIONS');
        expect(NPC).not.toContain('const NPC_ROLE_OPTIONS');
        expect(NPC).toContain('const NPC_BASIC_SKILLS');
    });

    it('references the tier/nature option constants from both the context and the header', () => {
        expect(NPC).toContain("context['npcTierOptions'] = NPC_TIER_OPTIONS");
        expect(NPC).toContain("context['npcNatureOptions'] = NPC_NATURE_OPTIONS");
        expect(NPC).toContain('options: NPC_TIER_OPTIONS');
        expect(NPC).toContain('options: NPC_NATURE_OPTIONS');
    });

    it('keeps the 21-skill list in exactly one place (the other projections derive)', () => {
        // The skill key 'sleightOfHand' appears once as data (the canonical list);
        // the {key,name} / [key,label,charShort] projections derive via .map().
        expect(countOccurrences(NPC, "sleightOfHand: 'Sleight of Hand'")).toBe(0);
        expect(NPC).toContain("key: 'sleightOfHand', name: 'Sleight of Hand'");
    });
});
