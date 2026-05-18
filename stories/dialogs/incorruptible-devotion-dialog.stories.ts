import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../src/templates/prompt/incorruptible-devotion-dialog.hbs?raw';
import { clickAction, renderSheet } from '../test-helpers';

interface Args {
    corruptionAmount: number;
}

const meta = {
    title: 'Dialogs/IncorruptibleDevotionDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            corruptionAmount: args.corruptionAmount,
            insanityAmount: args.corruptionAmount,
        }),
    args: {
        corruptionAmount: 3,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const SinglePoint: Story = {
    args: { corruptionAmount: 1 },
};

export const LargeBurst: Story = {
    args: { corruptionAmount: 7 },
};

export const TradeFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Trade + Decline action buttons must be present.
        const trade = canvasElement.querySelector('[data-action="trade"]');
        const decline = canvasElement.querySelector('[data-action="decline"]');
        expect(trade).not.toBeNull();
        expect(decline).not.toBeNull();
        expect(canvas.getByText(/Trade for Insanity/i)).toBeTruthy();

        // Clicking the Trade action dispatches the correct data-action.
        clickAction(canvasElement, 'trade');
    },
};
