/**
 * The Roll Test dialog's target and its breakdown come from the card's own
 * modifier record and component builder (#489).
 *
 * The dialog used to sum its target from a handful of local buckets plus an
 * unlabelled `weaponModSum`, and to render a breakdown line of four hand-picked
 * buckets. So a Parry read "45" over "Base 30", the #604 environment rows and a
 * weapon-modification fit's Availability −10 never showed, the weapon dialog
 * missed attack specials and passive to-hit, and fatigue / gang up / try-again /
 * climbing moved the dialog's number without reaching the card.
 *
 * The dialog class needs a booted Foundry, so this pins the wiring in source; the
 * behaviour is covered by the shared builder's unit tests (`roll-data.test.ts`),
 * the dialog stories, and the Tier B `roll-dialog-breakdown.spec.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readRepoFile } from '../src/module/testing/repo-file.ts';

const dialog = readRepoFile('src/module/applications/prompts/unified-roll-dialog.ts');
const targetDisplay = readRepoFile('src/templates/prompt/unified/target-display.hbs');

describe('Roll Test dialog target breakdown (#489)', () => {
    it('sums the target from the committed record, not a parallel local sum', () => {
        expect(dialog).not.toContain('weaponModSum');
        expect(dialog).not.toContain('dialogManagedKeys');
        expect(dialog).toContain('rd.assembleFinalModifiers({ ...(rd.modifiers ?? {}), ...pending.modifiers })');
        expect(dialog).toContain('const breakdown = isForceField ? null : this._targetBreakdown(baseTarget);');
    });

    it('itemises the target with the builder the chat card uses', () => {
        expect(dialog).toContain('buildModifierComponents(record, { ...rd.expandedBuckets, ...pending.expandedBuckets })');
    });

    it('commits exactly the dialog-owned modifiers the target was shown with', () => {
        const apply = dialog.slice(dialog.indexOf('_applyModifiersToRollData(): void {'));
        expect(apply).toContain('const pending = this._dialogModifierContributions();');
        expect(apply).toContain('Object.assign(rd.modifiers, pending.modifiers);');
        for (const key of ["'fatigue'", "'try-again'", "'climb-surface'", "modifiers['gang-up']"]) expect(dialog).toContain(key);
    });

    it('picking an attack mode re-renders the header, whose subtitle names the action (#607)', () => {
        const handler = dialog.slice(dialog.indexOf('static async #onSelectAttackMode'));
        const render = handler.slice(0, handler.indexOf('static async #onSelectAimMode'));
        expect(render).toContain("parts: ['header', 'contextPanel', 'targetDisplay', 'diceInput']");
    });

    it('renders one hoverable modifier row per component, not hand-picked buckets', () => {
        expect(targetDisplay).toContain('{{#each targetComponents as |component|}}');
        expect(targetDisplay).toContain('data-wh40k-tooltip="modifier" data-wh40k-tooltip-data="{{component.tooltipData}}"');
        expect(targetDisplay).not.toContain('situationalMod');
        expect(targetDisplay).not.toContain('difficultyMod');
    });
});
