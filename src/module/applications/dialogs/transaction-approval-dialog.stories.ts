import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/dialogs/transaction-approval-dialog.hbs?raw';

interface Args {
    summary: string;
    modeLabel: string;
    gmModifierPercent: number;
    estimatedFinal: number;
    hasAdjustments: boolean;
    adjustments: Array<{ label: string; value: number; positive: boolean }>;
    quote: {
        baseCost: number;
        finalCost: number;
        resourceLabel: string;
        influenceBurn: number;
    };
}

const meta = {
    title: 'Dialogs/TransactionApprovalDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        summary: 'Trooper requests 2x Lasgun from Quartermaster.',
        modeLabel: 'Barter',
        gmModifierPercent: 0,
        estimatedFinal: 200,
        hasAdjustments: true,
        adjustments: [
            { label: 'Disposition: friendly', value: -30, positive: false },
            { label: 'Influence burn (2 spent)', value: -40, positive: false },
        ],
        quote: { baseCost: 200, finalCost: 130, resourceLabel: 'Throne Gelt', influenceBurn: 2 },
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const NoAdjustments: Story = {
    args: {
        hasAdjustments: false,
        adjustments: [],
        quote: { baseCost: 200, finalCost: 200, resourceLabel: 'Requisition', influenceBurn: 0 },
        modeLabel: 'Requisition',
        estimatedFinal: 200,
    },
};

export const GmSurcharge: Story = {
    args: {
        gmModifierPercent: 25,
        estimatedFinal: 250,
        hasAdjustments: false,
        adjustments: [],
        quote: { baseCost: 200, finalCost: 200, resourceLabel: 'Throne Gelt', influenceBurn: 0 },
    },
};

/**
 * The GM step must expose both decision actions and the modifier input — the
 * runtime dialog routes `approve` / `reject` through Foundry's static-actions
 * resolver and reads `gmModifierPercent` back off the form.
 */
export const ApprovalControls: Story = {
    play: ({ canvasElement }) => {
        expect(canvasElement.querySelector('[data-action="approve"]')).toBeTruthy();
        expect(canvasElement.querySelector('[data-action="reject"]')).toBeTruthy();
        expect(canvasElement.querySelector('[name="gmModifierPercent"]')).toBeTruthy();
    },
};
