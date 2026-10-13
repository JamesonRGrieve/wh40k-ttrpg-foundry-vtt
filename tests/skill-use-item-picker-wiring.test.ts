/**
 * Regression guard (#535): `ea9bd60d2` removed the pre-roll use pop-up but never
 * built the inline item picker, so every item-choice use (Repair, Bypass Lock,
 * Break, Apply/Coat, Steal/Plant, Place/Defuse) rolled as a bare test and the
 * actor's item handlers had no callers. The unit tests stayed green because they
 * built the concrete actions directly.
 *
 * Source-scan: the acolyte document and the roll dialog need the Foundry runtime.
 * The contract checked here is the wiring between them: the acolyte hands its
 * inventory to the skill-use action, the dialog renders the pickers and runs the
 * pre-roll step on both roll paths, and the panel template renders a labelled
 * picker per slot.
 */

import { describe, expect, it } from 'vitest';
import { readRepoFile } from './lib/repo-file.ts';

const acolyte = readRepoFile('src/module/documents/acolyte.ts');
const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
const panel = readRepoFile('src/templates/prompt/unified/skill-use-panel.hbs');

describe('skill-use item picker wiring (#535)', () => {
    it('the acolyte gives the skill-use action its item source', () => {
        expect(acolyte).toContain('new SkillUseActionData(skillKey, skillLabel, undefined, this._skillUseItemSource())');
    });

    it('every item-choice family dispatches to its handler', () => {
        expect(acolyte).toContain('build: (use, choice, target) => dispatchItemChoiceUse(use, choice, handlersFor(target))');
        for (const handler of ['this._chemUseAction(', 'this._palmAction(', 'this._objectStateAction(', 'this._demolitionAction(']) {
            expect(acolyte).toContain(handler);
        }
    });

    it('the repair runs the xenos Forbidden Lore step before its dice', () => {
        expect(acolyte).toContain('beforeRoll: async (use, choice, target) => this._beforeItemUseRoll(use, choice, target)');
        expect(acolyte).toContain('await this._xenosAttemptModifiers(rules.xenos, item,');
    });

    it('the dialog runs the pre-roll step on both roll paths', () => {
        expect(dialog).toContain('async _systemRoll(): Promise<void> {\n        if (!(await this.#skillUseReadyToRoll())) return;');
        expect(dialog).toContain('if (this._manualRollTotal !== null && !(await this.#skillUseReadyToRoll())) return;');
    });

    it('the dialog takes the picks before the form merges into the roll data', () => {
        const take = dialog.indexOf('this.#takeSkillUseItemPicks(formObject)');
        const merge = dialog.indexOf('const data = foundry.utils.expandObject(formObject);');
        expect(take).toBeGreaterThan(-1);
        expect(take).toBeLessThan(merge);
    });

    it('the panel renders a labelled, described picker per slot', () => {
        expect(panel).toContain('{{#each skillUseItemPickers}}');
        expect(panel).toContain('<label for="{{inputId}}"');
        expect(panel).toContain('<select id="{{inputId}}" name="{{fieldName}}" aria-describedby="{{hintId}}"');
        expect(panel).toContain('<span id="{{hintId}}"');
    });
});
