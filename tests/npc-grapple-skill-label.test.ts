/**
 * Regression guard (#420): a grappled NPC's sheet threw "Cannot read properties of
 * undefined (reading 'acrobatics')". NPCSheet extends CharacterSheet, whose grapple
 * panel labelled the Slip Free skill from `system.skills` — which only the
 * character DataModel has; an NPC's skills are `trainedSkills`. The label is now a
 * protected hook NPCSheet overrides with the NPC model's catalog label.
 *
 * The sheet classes need Foundry globals at module load, so the contract is
 * checked at the source level; the Tier B NPC auto-apply spec opens the grappled
 * NPC's sheet for real.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const CHARACTER_SHEET = readRepoFile('src/module/applications/actor/character-sheet.ts');
const NPC_SHEET = readRepoFile('src/module/applications/actor/npc-sheet.ts');
const NPC_DATA = readRepoFile('src/module/data/actor/npc.ts');

describe('grapple panel skill labels on an NPC sheet (#420)', () => {
    it('the character sheet labels grapple skills only through its overridable hook', () => {
        expect(CHARACTER_SHEET).toContain('this._grappleSkillLabel(skill)');
        expect(CHARACTER_SHEET).toMatch(/protected _grappleSkillLabel\(skill: string\): string \{/);
    });

    it("the NPC sheet overrides it with the NPC model's catalog label", () => {
        expect(NPC_SHEET).toMatch(/protected override _grappleSkillLabel\(skill: string\): string \{\s*return this\.npcActor\.system\.skillLabel\(skill\);/);
        expect(NPC_DATA).toMatch(/skillLabel\(skillKey: string\): string \{/);
    });
});
