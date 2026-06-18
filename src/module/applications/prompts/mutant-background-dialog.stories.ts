import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/mutant-background-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';
import { MUTANT_STARTING_CORRUPTION } from '../../rules/chaos-backgrounds.ts';

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
        const view = within(canvasElement);
        const grant = canvasElement.querySelector('[data-talent="twisted-flesh"]');
        await expect(grant).toBeTruthy();
        await expect(view.getByText(/Apply/i)).toBeTruthy();
        await expect(view.getByText(/Twisted Flesh/i)).toBeTruthy();
    },
};
