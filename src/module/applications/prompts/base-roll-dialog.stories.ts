import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/base-roll-prompt.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface RollDataView {
    name: string;
    baseTarget: number;
}

interface Args {
    rollData?: RollDataView;
}

const meta = {
    title: 'Prompts/BaseRollDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        rollData: { name: 'Ballistic Skill', baseTarget: 45 },
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Default fallback template with a configured roll. */
export const WithRollData: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Ballistic Skill')).toBeTruthy();
        await expect(view.getByText('45')).toBeTruthy();
    },
};

/** No rollData — the unspecialised placeholder branch renders. */
export const Empty: Story = {
    args: { rollData: undefined },
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText(/Configure roll/)).toBeTruthy();
    },
};
