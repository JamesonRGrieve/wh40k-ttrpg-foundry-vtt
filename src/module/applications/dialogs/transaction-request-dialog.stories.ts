import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/dialogs/transaction-request-dialog.hbs?raw';
import { renderSheet } from '../../../../stories/test-helpers';

interface SourceArg {
    id: string;
    name: string;
    modeLabel: string;
    selected?: boolean;
}

interface ItemArg {
    id: string;
    name: string;
    type: string;
    quantity: number;
    cost: number;
    selected?: boolean;
}

interface QuoteArg {
    mode: string;
    baseCost: number;
    finalCost: number;
    resourceLabel: string;
    availableResource: number;
    remainingResource: number;
    remainingInfluence?: number;
    allowInfluenceBurn?: boolean;
    dispositionAttitude?: string | null;
    stockAvailable: boolean;
    canAfford: boolean;
    adjustments: Array<{ label: string; value: number }>;
}

interface Args {
    hasSources: boolean;
    sources: SourceArg[];
    selectedSource?: { name: string };
    items: ItemArg[];
    selectedItem?: ItemArg;
    quantity?: number;
    influenceBurn?: number;
    isBarter?: boolean;
    quote?: QuoteArg;
}

const STOCK: ItemArg[] = [
    { id: 'item-bolt', name: 'Bolt rounds (x24)', type: 'ammunition', quantity: 24, cost: 800 },
    { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250, selected: true },
];

const meta = {
    title: 'Dialogs/TransactionRequestDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        hasSources: true,
        selectedSource: { name: 'Black Market Contact' },
        sources: [
            { id: 'src-armoury', name: 'Inquisitorial Armoury', modeLabel: 'Requisition', selected: true },
            { id: 'src-blackmarket', name: 'Black Market Contact', modeLabel: 'Barter' },
        ],
        items: STOCK,
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Two-column transfer layout: source stock left, purchase pane right. */
export const SourceSelection: Story = {};

export const NoSources: Story = {
    args: { hasSources: false, sources: [], items: [] },
};

export const ItemSelected: Story = {
    args: {
        selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250 },
        quantity: 1,
        isBarter: false,
        quote: {
            mode: 'requisition',
            baseCost: 250,
            finalCost: 250,
            resourceLabel: 'Requisition',
            availableResource: 40,
            remainingResource: 0,
            allowInfluenceBurn: false,
            stockAvailable: true,
            canAfford: false,
            adjustments: [],
        },
    },
};

export const BarterWithInfluenceBurn: Story = {
    args: {
        selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250 },
        quantity: 1,
        isBarter: true,
        influenceBurn: 2,
        quote: {
            mode: 'barter',
            baseCost: 250,
            finalCost: 200,
            resourceLabel: 'Throne Gelt',
            availableResource: 1000,
            remainingResource: 800,
            remainingInfluence: 3,
            allowInfluenceBurn: true,
            stockAvailable: true,
            canAfford: true,
            adjustments: [{ label: 'Influence burn (2 spent)', value: -50 }],
        },
    },
};

export const HostileDisposition: Story = {
    args: {
        selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250 },
        quantity: 1,
        isBarter: true,
        quote: {
            mode: 'barter',
            baseCost: 250,
            finalCost: 338,
            resourceLabel: 'Throne Gelt',
            availableResource: 1000,
            remainingResource: 662,
            allowInfluenceBurn: true,
            dispositionAttitude: 'hostile',
            stockAvailable: true,
            canAfford: true,
            adjustments: [{ label: 'Disposition: hostile', value: 88 }],
        },
    },
};

/**
 * e2e: the source stock renders selectable rows wired to the `selectItem`
 * action, and the purchase pane exposes the GM-request control. These are the
 * exact hooks Foundry's static-actions resolver routes at runtime.
 */
export const TransferInteractions: Story = {
    args: BarterWithInfluenceBurn.args,
    play: async ({ canvasElement }) => {
        const rows = canvasElement.querySelectorAll('[data-action="selectItem"]');
        await expect(rows.length).toBeGreaterThanOrEqual(2);
        await expect(canvasElement.querySelector('[data-item-id="item-stub"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[data-action="requestApproval"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[name="influenceBurn"]')).toBeTruthy();
        await expect(canvasElement.querySelector('[name="quantity"]')).toBeTruthy();
    },
};

/** RAW DH2e barter pays in Influence directly, so the burn input is gated off. */
export const NoInfluenceBurnGate: Story = {
    args: {
        selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'weapon', quantity: 1, cost: 250 },
        quantity: 1,
        isBarter: true,
        quote: {
            mode: 'barter',
            baseCost: 250,
            finalCost: 250,
            resourceLabel: 'Influence',
            availableResource: 50,
            remainingResource: 0,
            allowInfluenceBurn: false,
            stockAvailable: true,
            canAfford: false,
            adjustments: [],
        },
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[name="influenceBurn"]')).toBeNull();
    },
};
