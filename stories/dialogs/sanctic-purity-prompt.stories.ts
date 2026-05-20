import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { SANCTIC_PURITY_FATE_COST } from '../../src/module/rules/sanctic-purity.ts';
import templateSrc from '../../src/templates/prompt/sanctic-purity-prompt.hbs?raw';
import { clickAction, renderSheet } from '../test-helpers';

/**
 * Sanctic Purity / Emperor's Anathema Fate-spend prompt (#131). The
 * dialog asks whether to spend a single Fate to negate a Psychic
 * Phenomena roll. Stories cover the can-spend, cannot-spend
 * (insufficient Fate), and decline-flow cases.
 */

interface Args {
    actorName: string;
    fateAvailable: number;
}

const meta = {
    title: 'Dialogs/SancticPurityPrompt',
    render: (args) =>
        renderSheet(templateSrc, {
            actorName: args.actorName,
            fateAvailable: args.fateAvailable,
            fateCost: SANCTIC_PURITY_FATE_COST,
            canSpend: args.fateAvailable >= SANCTIC_PURITY_FATE_COST,
        }),
    args: {
        actorName: 'Inquisitor Soren',
        fateAvailable: 3,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const CanSpend: Story = {};

export const NoFate: Story = {
    args: { actorName: 'Acolyte Kael', fateAvailable: 0 },
};

export const SpendFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        // Title is wired through the langpack key.
        expect(canvas.getByText(/Emperor's Anathema/i)).toBeTruthy();
        // Both action buttons exist.
        expect(canvasElement.querySelector('[data-action="spend"]')).toBeTruthy();
        expect(canvasElement.querySelector('[data-action="decline"]')).toBeTruthy();
        // Clicking the spend button dispatches the action.
        clickAction(canvasElement, 'spend');
    },
};

export const DeclineFlow: Story = {
    play: async ({ canvasElement }) => {
        clickAction(canvasElement, 'decline');
    },
};
