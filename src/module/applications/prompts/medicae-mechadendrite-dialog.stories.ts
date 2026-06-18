import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/prompt/medicae-mechadendrite-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

/**
 * Dialog story for the Medicae Mechadendrite Half-Action staunch prompt
 * (#104 — errata p. 183). Covers the eligible state (button enabled)
 * and the ineligible state (no cybernetic / IM system → button disabled).
 */

interface Args {
    actorName: string;
    eligible: boolean;
    medicaeBonus: number;
}

function buildContext(args: Args): Args {
    return {
        actorName: args.actorName,
        eligible: args.eligible,
        medicaeBonus: args.medicaeBonus,
    };
}

const meta = {
    title: 'Dialogs/MedicaeMechadendriteDialog',
    render: (args) => renderSheet(templateSrc, { ...buildContext(args) }),
    args: {
        actorName: 'Brother Medicae Voss',
        eligible: true,
        medicaeBonus: 10,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Eligible: Story = {};

export const Ineligible: Story = {
    args: { eligible: false },
};

export const RenderSmoke: Story = {
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        const staunch = canvasElement.querySelector('button[data-action="staunchBloodLoss"]');
        const cancel = canvasElement.querySelector('button[data-action="cancel"]');
        await expect(staunch).toBeTruthy();
        await expect(cancel).toBeTruthy();
        // Eligible default → staunch button enabled.
        await expect((staunch as HTMLButtonElement).disabled).toBe(false);
        await expect(view.getByText(/Brother Medicae Voss/i)).toBeTruthy();
    },
};

export const IneligibleDisablesButton: Story = {
    args: { eligible: false },
    play: async ({ canvasElement }) => {
        const staunch = canvasElement.querySelector('button[data-action="staunchBloodLoss"]');
        await expect((staunch as HTMLButtonElement).disabled).toBe(true);
    },
};
