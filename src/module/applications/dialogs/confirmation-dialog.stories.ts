import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/dialogs/confirmation.hbs?raw';

interface Args {
    content: string;
    confirmLabel: string;
    cancelLabel: string;
}

const meta = {
    title: 'Dialogs/ConfirmationDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        content: '<p>Are you sure you want to <strong>delete this item</strong>? This cannot be undone.</p>',
        confirmLabel: 'Delete',
        cancelLabel: 'Cancel',
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Acquisition: Story = {
    args: {
        content: '<p>Authorise <strong>3,500 thrones</strong> for <em>Bolt rounds (×24)</em>?</p>',
        confirmLabel: 'Authorise',
        cancelLabel: 'Stand Down',
    },
};

/**
 * Interactive flow — verifies the [data-action="confirm"] / [data-action="cancel"]
 * buttons are present and clickable. The play function uses the test-helpers
 * `clickAction` to drive the same selector ConfirmationDialog reads via its
 * static-actions table, so a story regression here is a real regression.
 */
export const ConfirmFlow: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const confirmBtn = canvas.getByText('Delete');
        const cancelBtn = canvas.getByText('Cancel');
        expect(confirmBtn).toBeTruthy();
        expect(cancelBtn).toBeTruthy();
        // Drive the same data-action handle the runtime sheet uses.
        clickAction(canvasElement, 'confirm');
        clickAction(canvasElement, 'cancel');
    },
};
