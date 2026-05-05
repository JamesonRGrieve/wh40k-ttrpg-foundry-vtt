import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/prompt/add-xp-prompt.hbs?raw';

interface Args {
    currentTotal: number;
    xpAmount: number;
    newTotal: number;
    absAmount: number;
    isAddition: boolean;
}

const meta = {
    title: 'Prompts/AddXPDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        currentTotal: 12500,
        xpAmount: 0,
        newTotal: 12500,
        absAmount: 0,
        isAddition: true,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const ZeroDelta: Story = {};

export const AddingXP: Story = {
    args: {
        currentTotal: 12500,
        xpAmount: 500,
        absAmount: 500,
        newTotal: 13000,
        isAddition: true,
    },
};

export const SubtractingXP: Story = {
    args: {
        currentTotal: 12500,
        xpAmount: -200,
        absAmount: 200,
        newTotal: 12300,
        isAddition: false,
    },
};

/**
 * Asserts the Apply button reflects the disabled state when xpAmount is 0,
 * and that data-action attributes wire to the runtime action handlers.
 */
export const ApplyDisabledAtZero: Story = {
    args: { xpAmount: 0, absAmount: 0, currentTotal: 0, newTotal: 0, isAddition: true },
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const apply = canvasElement.querySelector('[data-action="apply"]') as HTMLButtonElement | null;
        const cancel = canvasElement.querySelector('[data-action="cancel"]');
        expect(apply).toBeTruthy();
        expect(cancel).toBeTruthy();
        expect(apply!.disabled).toBe(true);
        clickAction(canvasElement, 'cancel');
        void canvas;
    },
};
