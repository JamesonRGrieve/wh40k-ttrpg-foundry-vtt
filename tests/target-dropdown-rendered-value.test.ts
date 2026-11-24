/**
 * #764: a dialog submit retargets only when the combatant dropdown moved off the row
 * it was rendered with. That row is carried on the select itself, so a submit that
 * races a re-render compares the DOM's own value with the DOM's own rendered row,
 * never a sheet field already updated for the next render.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const selector = readRepoFile('src/templates/prompt/unified/target-selector.hbs');
const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');

describe('combatant dropdown: rendered row travels with the element (#764)', () => {
    it('the select carries the row it was rendered with', () => {
        expect(selector).toContain('name="targetCombatantId" data-rendered-combatant="{{renderedCombatantId}}"');
    });

    it('the submit compares the picked row with that rendered row, not with sheet state', () => {
        expect(dialog).toContain(`form.querySelector<HTMLSelectElement>('select[name="targetCombatantId"]')?.dataset['renderedCombatant']`);
        expect(dialog).toContain('if (picked !== rendered) this.#applyTargetCombatant(picked);');
        expect(dialog).not.toContain('_renderedCombatantId');
    });

    it('the selector context provides the rendered row', () => {
        expect(dialog).toContain("renderedCombatantId: combatants.find((row) => row.isSelected)?.id ?? '',");
    });
});
