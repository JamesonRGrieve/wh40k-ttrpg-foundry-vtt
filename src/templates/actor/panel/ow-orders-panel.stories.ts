/**
 * Storybook stories for the Only War Orders panel (#153).
 * Covers the three operator-visible states:
 *
 *   1. AllAvailable      — fresh turn, all three generic Orders issuable.
 *   2. ActionDepleted    — actor used a half-action; remaining half-cost
 *                          Orders are blocked with the action validation
 *                          reason.
 *   3. WithSweeping      — a Sergeant has a Sweeping Order broadcasting
 *                          to four squad members.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import panelSrc from './ow-orders-panel.hbs?raw';

initializeStoryHandlebars();

interface AvailableOrderCtx {
    orderId: 'ranged-volley' | 'close-quarters' | 'take-cover';
    nameKey: string;
    effectKey: string;
    actionCostKey: string;
    actionCost: 'free' | 'half' | 'full';
    canIssue: boolean;
    blockReasonKey: string | null;
}

interface SweepingOrderCtx {
    orderId: string;
    nameKey: string;
    effectKey: string | null;
    appliedCount: number;
}

interface OrdersPanelCtx {
    ordersPanel: {
        available: AvailableOrderCtx[];
        sweepingActive: SweepingOrderCtx[];
    };
}

function renderPanel(ctx: OrdersPanelCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderSheet(panelSrc, ctx));
    return wrapper;
}

const ALL_AVAILABLE: AvailableOrderCtx[] = [
    {
        orderId: 'ranged-volley',
        nameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
        effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
        actionCostKey: 'WH40K.OW.Orders.ActionCost.Half',
        actionCost: 'half',
        canIssue: true,
        blockReasonKey: null,
    },
    {
        orderId: 'close-quarters',
        nameKey: 'WH40K.OW.Orders.Generic.CloseQuarters',
        effectKey: 'WH40K.OW.Orders.Effect.CloseQuarters',
        actionCostKey: 'WH40K.OW.Orders.ActionCost.Half',
        actionCost: 'half',
        canIssue: true,
        blockReasonKey: null,
    },
    {
        orderId: 'take-cover',
        nameKey: 'WH40K.OW.Orders.Generic.TakeCover',
        effectKey: 'WH40K.OW.Orders.Effect.TakeCover',
        actionCostKey: 'WH40K.OW.Orders.ActionCost.Half',
        actionCost: 'half',
        canIssue: true,
        blockReasonKey: null,
    },
];

const meta: Meta<OrdersPanelCtx> = {
    title: 'Actor/Character/OwOrdersPanel',
};
export default meta;
type Story = StoryObj<OrdersPanelCtx>;

export const AllAvailable: Story = {
    name: 'All three generic Orders available — fresh turn, no sweeping',
    args: {
        ordersPanel: {
            available: ALL_AVAILABLE,
            sweepingActive: [],
        },
    },
    render: (args) => renderPanel(args),
};

export const ActionDepleted: Story = {
    name: 'Action depleted — every half-cost Order blocked',
    args: {
        ordersPanel: {
            available: ALL_AVAILABLE.map((o) => ({
                ...o,
                canIssue: false,
                blockReasonKey: 'WH40K.OW.Orders.Validation.InsufficientAction',
            })),
            sweepingActive: [],
        },
    },
    render: (args) => renderPanel(args),
};

export const WithSweeping: Story = {
    name: 'Sergeant with active Sweeping Order broadcasting to four members',
    args: {
        ordersPanel: {
            available: ALL_AVAILABLE,
            sweepingActive: [
                {
                    orderId: 'sgt-ranged-discipline',
                    nameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
                    effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
                    appliedCount: 4,
                },
            ],
        },
    },
    render: (args) => renderPanel(args),
};
