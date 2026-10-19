/**
 * The item-choice picker (#668) at its 480px width, with the nineteen Only War
 * Regimental Drawbacks — the case where "Lost Home World" overflowed its button when
 * the choices were one footer row.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { overflowingLabels } from '../testing/label-fit';
import { itemChoiceContent } from './skill-use-picker';

initializeStoryHandlebars();

const DRAWBACKS = [
    'Cloud of Suspicion',
    'Condemned',
    'Conscripts',
    'Cult of Chivalry',
    'Dishonoured',
    'Doomed',
    'Honour Bound',
    'Iconoclasts',
    'Incompetent Leadership',
    'Lost Home World',
    'Mistrusted',
    'Poorly Provisioned',
    'Primitive',
    'Regimental Rivalry',
    'Scarred by Loss',
    'Tainted',
    'The Few',
    'Traitors',
    'Warp-Delayed',
];

/** The picker's content width: the dialog's 480px less Foundry's window padding. */
const CONTENT_WIDTH_PX = 480 - 32;

const meta: Meta = { title: 'Prompts/ItemChoicePicker' };
export default meta;
type Story = StoryObj;

/** Every name sits inside its own button, wrapping onto a second line when it must. */
export const LongNamesWrapInGrid: Story = {
    render: () => {
        const host = document.createElement('div');
        host.className = 'wh40k-rpg';
        host.style.width = `${CONTENT_WIDTH_PX}px`;
        const content = itemChoiceContent(
            DRAWBACKS.map((name, index) => ({ id: `drawback-${index}`, name })),
            'Choose the drawback your regiment took.',
        );
        host.append(...Array.from(content.childNodes));
        return host;
    },
    play: async ({ canvasElement }) => {
        const buttons = Array.from(canvasElement.querySelectorAll<HTMLButtonElement>('[data-item-choices] button'));
        await expect(buttons).toHaveLength(DRAWBACKS.length);
        await expect(overflowingLabels(buttons)).toEqual([]);
        // More than one choice a row, so nineteen choices don't run into a single column either.
        const rows = new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
        await expect(rows.size).toBeLessThan(DRAWBACKS.length);
    },
};
