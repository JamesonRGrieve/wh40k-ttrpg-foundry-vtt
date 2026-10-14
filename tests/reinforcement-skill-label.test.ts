/**
 * Regression guard: an RC whose caller terms name a skill (the Thrice-Bound
 * Daemonhost, Enemies Beyond p. 38) renders its NPC sheet and call dialog (#77).
 * Both read the required skill's label from `npc.skills`, but the NPC data model
 * has no PC-style `skills` rows, so the sheet threw "Cannot read properties of
 * undefined (reading 'forbiddenLore')" the moment the panel was built for a GM.
 * The story and unit tests passed because they handed the view a mock row map;
 * the Tier B reinforcement spec caught it on a compendium import.
 *
 * Source scan for the call sites (the sheet and dialog pull Foundry globals at
 * load); the catalog the NPC's `skillLabel` reads is checked directly.
 */

import { describe, expect, it } from 'vitest';
import { SKILL_DEFINITIONS } from '../src/module/data/shared/skill-definitions.ts';
import { readRepoFile } from './lib/repo-file.ts';

const NPC_SHEET = readRepoFile('src/module/applications/actor/npc-sheet.ts');
const CALL_DIALOG = readRepoFile('src/module/applications/dialogs/reinforcement-call-dialog.ts');
const NPC_DATA = readRepoFile('src/module/data/actor/npc.ts');

describe('Reinforcement caller skill label (#77)', () => {
    it('neither the NPC sheet nor the call dialog reads skill rows off the NPC', () => {
        expect(NPC_SHEET).not.toMatch(/requiredSkillLabel\(npc\.skills/u);
        expect(NPC_SHEET).toContain('requiredSkillLabel((skill) => npc.skillLabel(skill), terms.caller)');
        expect(CALL_DIALOG).not.toMatch(/system\.skills, terms\.caller/u);
        expect(CALL_DIALOG).toContain('requiredSkillLabel((skill) => this.#rc.system.skillLabel(skill), terms.caller)');
    });

    it('the NPC data model labels a skill from the catalog, specialist skills included', () => {
        expect(NPC_DATA).toContain('return SKILL_LABELS.get(skillKey) ?? skillKey;');
        expect(SKILL_DEFINITIONS['forbiddenLore'].label).toBe('Forbidden Lore');
    });
});
