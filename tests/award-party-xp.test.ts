/**
 * #553: the party XP award opens from every character sheet's Experience panel,
 * for the GM only, through the batch dialog that ticks every character by default.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const panel = readRepoFile('src/templates/actor/panel/experience-panel.hbs');
const sheet = readRepoFile('src/module/applications/actor/character-sheet.ts');
const actions = readRepoFile('src/module/applications/actor/character/experience-actions.ts');
const dialog = readRepoFile('src/module/applications/prompts/batch-xp-dialog.ts');

describe('party XP award from the character sheet (#553)', () => {
    it('the Experience panel shows the party award button to the GM only', () => {
        const gate = panel.indexOf('{{#if @root.isGM}}');
        const button = panel.indexOf('action="awardPartyXP"');
        expect(gate).toBeGreaterThan(-1);
        expect(button).toBeGreaterThan(gate);
        expect(panel.indexOf('{{/if}}', gate)).toBeGreaterThan(button);
        expect(panel).toContain('title=(localize "WH40K.XP.AwardParty")');
    });

    it('the sheet binds the action, which opens the batch dialog for a GM only', () => {
        expect(sheet).toContain("'awardPartyXP': ExperienceActions.awardPartyXP");
        expect(actions).toMatch(/export async function awardPartyXP[\s\S]*if \(!game\.user\.isGM\) return;[\s\S]*openBatchXPDialog\(\)/);
    });

    it('the batch dialog starts with every character ticked', () => {
        expect(dialog).toMatch(/this\.selectedIds = new Set\([\s\S]*filter\(\(a\) => a\.type\.includes\('character'\)\)/);
    });
});
