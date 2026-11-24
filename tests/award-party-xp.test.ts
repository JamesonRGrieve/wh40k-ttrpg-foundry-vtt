/**
 * #553: the party XP award opens from every character sheet's Overview XP controls,
 * for the GM only, through the batch dialog that ticks every character by default.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const OVERVIEW = 'systems/wh40k-rpg/templates/actor/player/tab-overview.hbs';
const overview = readRepoFile('src/templates/actor/player/tab-overview.hbs');
const sheet = readRepoFile('src/module/applications/actor/character-sheet.ts');
const actions = readRepoFile('src/module/applications/actor/character/experience-actions.ts');
const dialog = readRepoFile('src/module/applications/prompts/batch-xp-dialog.ts');

describe('party XP award from the character sheet (#553)', () => {
    it('the button sits in a template the sheet renders', () => {
        // The first version went into a panel no sheet part included, so it never showed.
        expect(sheet).toContain(`template: '${OVERVIEW}'`);
    });

    it('the Overview XP controls show the party award button to the GM only', () => {
        const button = overview.indexOf('data-action="awardPartyXP"');
        const gate = overview.lastIndexOf('{{#if isGM}}', button);
        expect(button).toBeGreaterThan(-1);
        expect(gate).toBeGreaterThan(-1);
        expect(overview.indexOf('{{/if}}', gate)).toBeGreaterThan(button);
        expect(overview).toContain(`data-tooltip="{{localize 'WH40K.XP.AwardParty'}}"`);
    });

    it('the sheet binds the action, which opens the batch dialog for a GM only', () => {
        expect(sheet).toContain("'awardPartyXP': ExperienceActions.awardPartyXP");
        expect(actions).toMatch(/export async function awardPartyXP[\s\S]*if \(!game\.user\.isGM\) return;[\s\S]*openBatchXPDialog\(\)/);
    });

    it('the batch dialog starts with every character ticked', () => {
        expect(dialog).toMatch(/this\.selectedIds = new Set\([\s\S]*filter\(\(a\) => a\.type\.includes\('character'\)\)/);
    });
});
