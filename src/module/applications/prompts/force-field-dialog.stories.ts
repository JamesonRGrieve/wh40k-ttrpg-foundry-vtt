import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/force-field-prompt.hbs?raw';
import { assertField, renderSheet } from '../../../../stories/test-helpers';

interface ActorView {
    name: string;
    img: string;
}

interface ForceFieldView {
    name: string;
    system: {
        protectionRating: number;
        state: {
            activated: boolean;
            overloaded: boolean;
        };
    };
}

interface Args {
    actor: ActorView;
    forceField: ForceFieldView;
    protectionRating: number;
    overloadRating: number;
}

const meta = {
    title: 'Prompts/ForceFieldDialog',
    render: (args) => renderSheet(templateSrc, { ...args }),
    args: {
        actor: { name: 'Rogue Trader Voss', img: 'icons/svg/mystery-man.svg' },
        forceField: {
            name: 'Refractor Field',
            system: { protectionRating: 30, state: { activated: true, overloaded: false } },
        },
        protectionRating: 30,
        overloadRating: 1,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** An activated, ready refractor field. */
export const Active: Story = {};

/** An overloaded conversion field — the roll engine would block this. */
export const Overloaded: Story = {
    args: {
        forceField: {
            name: 'Conversion Field',
            system: { protectionRating: 50, state: { activated: true, overloaded: true } },
        },
        protectionRating: 50,
        overloadRating: 3,
    },
};

/** Confirms the protection rating field and roll button are present. */
export const Wired: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByText('Refractor Field')).toBeTruthy();
        assertField(canvasElement, 'protectionRating', 30);
        const roll = canvasElement.querySelector<HTMLButtonElement>('#roll-force-field');
        const cancel = canvasElement.querySelector<HTMLButtonElement>('#cancel-prompt');
        await expect(roll).toBeTruthy();
        await expect(cancel).toBeTruthy();
        cancel?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
