/**
 * Storybook stories for the Black Crusade Chaos Ritual dialog body (Table 6-7).
 *
 * The dialog is BC-only (the action gates on the actor's line), so there is no
 * per-line variant to render. The stories frame it at the DialogV2 width it
 * opens at so a truncated Kind select is visible in review.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import { buildRitualDialogRows } from '../../module/actions/bc-ritual-actions';
import templateSrc from './bc-ritual-dialog.hbs?raw';

initializeStoryHandlebars();

interface Args {
    mastery: number;
}

/** Render at the dialog's 480px content width, inside the `.wh40k-rpg` scope the dialog carries. */
function renderDialog(args: Args): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.width = '448px';
    wrapper.style.padding = '16px';
    wrapper.appendChild(renderSheet(templateSrc, { rows: buildRitualDialogRows(args.mastery, localizeKey) }));
    return wrapper;
}

const meta = {
    title: 'Black Crusade/Chaos Ritual Dialog',
    render: (args) => renderDialog(args),
    args: { mastery: 2 },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** The four pre-allocated rows; each Kind select spans its row and shows its whole label. */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        const selects = [...canvasElement.querySelectorAll<HTMLSelectElement>('select[name^="mod-kind-"]')];
        const chosen = selects.map((s) => s.querySelector('option[selected]')?.getAttribute('value'));
        await expect(chosen).toEqual(['cult-affiliation', 'sacrifice', 'daemonic-mastery', 'gm-other']);
        await expect(canvasElement.querySelector<HTMLInputElement>('[name="mod-value-2"]')?.value).toBe('2');
        const clipped = selects.filter((select) => select.scrollWidth > select.clientWidth + 1);
        await expect(clipped).toEqual([]);
    },
};

/** Repurposing a row: the longest kind label still fits. */
export const LongestKind: Story = {
    args: { mastery: 0 },
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('[name="mod-kind-0"]');
        if (select === null) throw new Error('mod-kind-0 missing');
        select.value = 'component-reagent';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        await expect(select.selectedOptions.item(0)?.textContent).toBe(localizeKey('WH40K.BC.Ritual.Modifier.ComponentReagent'));
        await expect(select.getBoundingClientRect().width).toBeGreaterThan(200);
    },
};
