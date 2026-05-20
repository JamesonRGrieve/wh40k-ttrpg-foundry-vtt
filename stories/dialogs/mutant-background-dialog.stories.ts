import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { MUTANT_STARTING_CORRUPTION } from '../../src/module/rules/chaos-backgrounds.ts';
import templateSrc from '../../src/templates/prompt/mutant-background-dialog.hbs?raw';
import { renderSheet } from '../test-helpers';

interface Args {
    canApply: boolean;
    actorName: string | null;
}

const meta = {
    title: 'Dialogs/MutantBackgroundDialog',
    render: (args) =>
        renderSheet(templateSrc, {
            startingCorruption: MUTANT_STARTING_CORRUPTION,
            actorName: args.actorName,
            canApply: args.canApply,
        }),
    args: {
        canApply: true,
        actorName: null,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const WithTargetActor: Story = {
    args: {
        actorName: 'Aurelia Vex',
    },
};

export const DisabledApply: Story = {
    args: { canApply: false },
};

export const TwistedFleshGrantPresent: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const grant = canvasElement.querySelector('[data-talent="twisted-flesh"]');
        expect(grant).toBeTruthy();
        expect(canvas.getByText(/Apply/i)).toBeTruthy();
        expect(canvas.getByText(/Twisted Flesh/i)).toBeTruthy();
    },
};
