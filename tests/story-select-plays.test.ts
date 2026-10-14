/**
 * Run the sheet stories whose play functions read a `<select>` (or a label a
 * select repeats) under happy-dom, the unit-test DOM (#637). happy-dom reads a
 * whitespace-separated select at the wrong option, so `select.value` and
 * `assertField` failed here although the browser was right; the shared harness
 * (`stories/test-helpers.ts` `syncSelectedOptions`) now re-applies the marked
 * option. Four stories also queried a label the sheet prints twice. These
 * stories double as the harness's regression test.
 */
import type { Args, Meta, StoryContext, StoryObj } from '@storybook/html-vite';
import { describe, expect, it } from 'vitest';
import * as conditionSheet from '../src/module/applications/item/condition-sheet.stories.ts';
import * as criticalInjurySheet from '../src/module/applications/item/critical-injury-sheet.stories.ts';
import * as cyberneticSheet from '../src/module/applications/item/cybernetic-sheet.stories.ts';
import * as mutationSheet from '../src/module/applications/item/mutation-sheet.stories.ts';
import * as originPathSheet from '../src/module/applications/item/origin-path-sheet.stories.ts';
import * as skillSheet from '../src/module/applications/item/skill-sheet.stories.ts';
import * as specialAbilitySheet from '../src/module/applications/item/special-ability-sheet.stories.ts';
import { assertField, renderSheet, renderSheetParts, syncSelectedOptions } from '../stories/test-helpers.ts';

/**
 * Render one story into the document and run its play function, the way the
 * Storybook canvas does: meta args under story args, the story's render (else
 * the meta's), then the story's play (else the meta's). The context carries
 * the two fields these stories read (`args`, `canvasElement`).
 */
async function runStory<A extends Args>(meta: Meta<A>, story: StoryObj<A>): Promise<void> {
    const args = { ...meta.args, ...story.args } as A;
    const render = story.render ?? meta.render;
    if (render === undefined) throw new Error('the story has no render function');
    const context = { args, canvasElement: document.body } as StoryContext<A>;
    const rendered = render(args, context);
    const canvasElement = rendered instanceof HTMLElement ? rendered : document.createElement('div');
    document.body.replaceChildren(canvasElement);
    const play = story.play ?? meta.play;
    if (play !== undefined) await play({ ...context, canvasElement });
}

/** The stories that read a select (or a label a select repeats), by sheet. */
const CASES: Array<[string, () => Promise<void>]> = [
    ['condition-sheet › RendersTabs', async () => runStory(conditionSheet.default, conditionSheet.RendersTabs)],
    ['critical-injury-sheet › RendersHeader', async () => runStory(criticalInjurySheet.default, criticalInjurySheet.RendersHeader)],
    ['cybernetic-sheet › RendersTypeLabel', async () => runStory(cyberneticSheet.default, cyberneticSheet.RendersTypeLabel)],
    ['origin-path-sheet › RendersStepBadge', async () => runStory(originPathSheet.default, originPathSheet.RendersStepBadge)],
    ['skill-sheet › RendersSelectAndName', async () => runStory(skillSheet.default, skillSheet.RendersSelectAndName)],
    ['mutation-sheet › GiftEditMode', async () => runStory(mutationSheet.default, mutationSheet.GiftEditMode)],
    ['special-ability-sheet › DistinctionEditMode', async () => runStory(specialAbilitySheet.default, specialAbilitySheet.DistinctionEditMode)],
    ['special-ability-sheet › MarkEditMode', async () => runStory(specialAbilitySheet.default, specialAbilitySheet.MarkEditMode)],
    ['special-ability-sheet › AdvancedEditMode', async () => runStory(specialAbilitySheet.default, specialAbilitySheet.AdvancedEditMode)],
];

describe('renderSheet selects the option the markup marks selected', () => {
    const SELECT = `<select name="kind">
        <option value="basic">Basic</option>
        <option value="advanced">Advanced</option>
        <option value="specialist" selected>Specialist</option>
    </select>
    <select name="tags" multiple>
        <option value="a" selected>A</option>
        <option value="b">B</option>
        <option value="c" selected>C</option>
    </select>`;

    it('reads a whitespace-separated single select at its selected option (happy-dom read the second one)', () => {
        const root = renderSheet(SELECT);
        const select = root.querySelector<HTMLSelectElement>('select[name="kind"]');
        expect(select?.value).toBe('specialist');
        expect(select?.selectedIndex).toBe(2);
        assertField(root, 'kind', 'specialist');
    });

    it('keeps every selected option of a multiple select', () => {
        const root = renderSheet(SELECT);
        const select = root.querySelector<HTMLSelectElement>('select[name="tags"]');
        expect(Array.from(select?.selectedOptions ?? []).map((option) => option.value)).toEqual(['a', 'c']);
    });

    it('applies to composed sheets too, and leaves a select with nothing marked on its first option', () => {
        const root = renderSheetParts([
            { template: SELECT },
            { template: '<select name="plain">\n  <option value="x">X</option>\n  <option value="y">Y</option>\n</select>' },
        ]);
        assertField(root, 'kind', 'specialist');
        assertField(root, 'plain', 'x');
        expect(syncSelectedOptions(root)).toBe(root);
    });
});

describe('select-reading sheet stories under happy-dom', () => {
    it.each(CASES)('%s', async (_label, run) => {
        // The play function's own assertions throw on failure.
        await expect(run()).resolves.toBeUndefined();
    });
});
