import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/righteous-fury-prompt.hbs?raw';
import { clickAction, renderSheet } from '../../../../stories/test-helpers';

interface Args {
    weaponName: string;
    characteristic: string;
    target: number;
    hasRolled: boolean;
    success?: boolean;
    confirmationRoll?: { total: number };
    dos?: number;
}

const meta = {
    title: 'Prompts/RighteousFuryDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        weaponName: 'Bolter',
        characteristic: 'Ballistic Skill 45',
        target: 45,
        hasRolled: false,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Pending: Story = {};

export const Confirmed: Story = {
    args: {
        hasRolled: true,
        success: true,
        confirmationRoll: { total: 28 },
        dos: 2,
    },
};

export const NotConfirmed: Story = {
    args: {
        hasRolled: true,
        success: false,
        confirmationRoll: { total: 87 },
    },
};

export const RollFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText(/Righteous Fury/)).toBeTruthy();
        expect(canvas.getByText('Bolter')).toBeTruthy();
        clickAction(canvasElement, 'roll');
    },
};
