/**
 * Storybook stories for the OW Order chat card (#152, #153):
 * what the Comrade did with the Order it was given.
 *
 *   1. RangedVolley       — carried out in Cohesion; one Half Action left.
 *   2. NoBenefit          — carried out out of Cohesion: the PC gains nothing.
 *   3. NoActionsLeft      — given after the Comrade used its Actions: no effect.
 *   4. Pinned             — a pinned Comrade takes no Actions.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { localizeKey } from '../../../stories/mocks/lang-localize';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { renderSheet } from '../../../stories/test-helpers';
import cardSrc from './ow-orders-chat.hbs?raw';

initializeStoryHandlebars();

interface OrdersChatCtx {
    gameSystem: 'ow';
    orderId: string;
    orderNameKey: string;
    actionCostKey: string;
    effectKey: string;
    comradeName: string;
    enacted: boolean;
    blockKey: string | null;
    noBenefit: boolean;
    inCombat: boolean;
    actionsLeft: number;
}

const VOLLEY: OrdersChatCtx = {
    gameSystem: 'ow',
    orderId: 'ranged-volley',
    orderNameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
    actionCostKey: 'WH40K.OW.Orders.ActionCost.Half',
    effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
    comradeName: 'Comrade Voss',
    enacted: true,
    blockKey: null,
    noBenefit: false,
    inCombat: true,
    actionsLeft: 1,
};

function renderCard(ctx: OrdersChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.style.maxWidth = '300px';
    wrapper.appendChild(renderSheet(cardSrc, ctx));
    return wrapper;
}

const meta: Meta<OrdersChatCtx> = { title: 'Chat/OwOrdersChat', render: (args) => renderCard(args) };
export default meta;
type Story = StoryObj<OrdersChatCtx>;

function outcome(root: HTMLElement): string | null {
    return root.querySelector('[data-order-outcome]')?.getAttribute('data-order-outcome') ?? null;
}

export const RangedVolley: Story = {
    name: 'Ranged Volley carried out — +5 BS this Turn',
    args: VOLLEY,
    play: async ({ canvasElement }) => {
        await expect(outcome(canvasElement)).toBe('enacted');
        await expect(canvasElement.querySelector('[data-order-effect]')?.textContent).toContain(localizeKey('WH40K.OW.Orders.Effect.RangedVolley'));
        await expect(canvasElement.querySelector('[data-order-actions-left]')?.getAttribute('data-order-actions-left')).toBe('1');
        await expect(canvasElement.textContent).toContain('Comrade Voss');
    },
};

export const NoBenefit: Story = {
    name: 'Out of Cohesion — carried out, but the PC gains nothing',
    args: { ...VOLLEY, noBenefit: true },
    play: async ({ canvasElement }) => {
        await expect(outcome(canvasElement)).toBe('enacted');
        await expect(canvasElement.querySelector('[data-order-no-benefit]')?.textContent).toContain(localizeKey('WH40K.OW.Orders.NoBenefit'));
    },
};

export const NoActionsLeft: Story = {
    name: 'No Actions left — no effect',
    args: { ...VOLLEY, enacted: false, blockKey: 'WH40K.OW.Orders.Block.NoActions', actionsLeft: 0 },
    play: async ({ canvasElement }) => {
        await expect(outcome(canvasElement)).toBe('no-effect');
        await expect(canvasElement.querySelector('[data-order-block]')?.textContent).toContain(localizeKey('WH40K.OW.Orders.Block.NoActions'));
        await expect(canvasElement.querySelector('[data-order-effect]')).toBeNull();
    },
};

export const Pinned: Story = {
    name: 'Pinned Comrade — no effect',
    args: { ...VOLLEY, orderId: 'move-half', orderNameKey: 'WH40K.OW.Orders.Move.MoveHalf', enacted: false, blockKey: 'WH40K.OW.Orders.Block.Pinned' },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-order-block]')?.textContent).toContain(localizeKey('WH40K.OW.Orders.Block.Pinned'));
    },
};
