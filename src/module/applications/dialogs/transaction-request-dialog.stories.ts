import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { renderSheet, clickAction } from '../../../../stories/test-helpers';
import templateSrc from '../../../../src/templates/dialogs/transaction-request-dialog.hbs?raw';

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

interface Args {
    hasSources: boolean;
    sources: SourceArg[];
    items: ItemArg[];
    selectedItem?: ItemArg;
    quantity?: number;
    influenceBurn?: number;
    isBarter?: boolean;
    quote?: { totalCost: number };
}

const meta = {
    title: 'Dialogs/TransactionRequestDialog',
    render: (args) => renderSheet(templateSrc, args as unknown as Record<string, unknown>),
    args: {
        hasSources: true,
        sources: [
            { id: 'src-armoury', name: 'Inquisitorial Armoury', modeLabel: 'Requisition', selected: true },
            { id: 'src-blackmarket', name: 'Black Market Contact', modeLabel: 'Barter' },
        ],
        items: [
            { id: 'item-bolt', name: 'Bolt rounds (×24)', type: 'Ammunition', quantity: 24, cost: 800 },
            { id: 'item-stub', name: 'Stub revolver', type: 'Weapon', quantity: 1, cost: 250, selected: true },
        ],
    },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const SourceSelection: Story = {};

export const NoSources: Story = {
    args: { hasSources: false, sources: [], items: [] },
};

export const ItemSelected: Story = {
    args: {
        selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'Weapon', quantity: 1, cost: 250 },
        quantity: 1,
        isBarter: false,
    },
};

export const BarterMode: Story = {
    args: {
        selectedItem: { id: 'item-stub', name: 'Stub revolver', type: 'Weapon', quantity: 1, cost: 250 },
        quantity: 1,
        isBarter: true,
        influenceBurn: 2,
    },
};

/**
 * Asserts the per-item selection buttons carry the expected data-action and
 * data-item-id pair — the runtime sheet routes both verbatim into Foundry's
 * static-actions resolver.
 */
export const SelectItemDispatch: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const buttons = canvasElement.querySelectorAll('[data-action="selectItem"]');
        expect(buttons.length).toBeGreaterThanOrEqual(2);
        const stub = canvasElement.querySelector('[data-item-id="item-stub"]');
        expect(stub).toBeTruthy();
        clickAction(canvasElement, 'selectItem');
        void canvas;
    },
};
