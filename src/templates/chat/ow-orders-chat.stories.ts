/**
 * Storybook stories for the OW Orders issuance chat card (#153).
 *
 *   1. RangedVolley       — three-member squad, half-action generic Order.
 *   2. TakeCoverNoSquad   — Order issued with empty squad roster.
 *   3. Sweeping           — Sergeant Sweeping Order broadcast banner.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { renderTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import cardSrc from './ow-orders-chat.hbs?raw';

initializeStoryHandlebars();

interface AffectedMemberCtx {
    id: string;
    name: string;
}

interface OrdersChatCtx {
    gameSystem: 'ow';
    orderId: string;
    orderNameKey: string;
    actionCostKey: string;
    kindKey: string;
    sweeping: boolean;
    effectKey: string | null;
    affectedMembers: AffectedMemberCtx[];
}

const cardTpl = Handlebars.compile(cardSrc);

function renderCard(ctx: OrdersChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('wh40k-rpg');
    wrapper.dataset['wh40kSystem'] = 'ow';
    wrapper.appendChild(renderTemplate(cardTpl, ctx));
    return wrapper;
}

const meta: Meta<OrdersChatCtx> = {
    title: 'Chat/OwOrdersChat',
};
export default meta;
type Story = StoryObj<OrdersChatCtx>;

export const RangedVolley: Story = {
    name: 'Ranged Volley issued — three squad members affected',
    args: {
        gameSystem: 'ow',
        orderId: 'ranged-volley',
        orderNameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
        actionCostKey: 'WH40K.OW.Orders.ActionCost.Half',
        kindKey: 'WH40K.OW.Orders.Kind.Generic',
        sweeping: false,
        effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
        affectedMembers: [
            { id: 'cmd-01', name: 'Comrade Voss' },
            { id: 'cmd-02', name: 'Comrade Ren' },
            { id: 'cmd-03', name: 'Comrade Liska' },
        ],
    },
    render: (args) => renderCard(args),
};

export const TakeCoverNoSquad: Story = {
    name: 'Take Cover! issued — empty squad roster',
    args: {
        gameSystem: 'ow',
        orderId: 'take-cover',
        orderNameKey: 'WH40K.OW.Orders.Generic.TakeCover',
        actionCostKey: 'WH40K.OW.Orders.ActionCost.Half',
        kindKey: 'WH40K.OW.Orders.Kind.Generic',
        sweeping: false,
        effectKey: 'WH40K.OW.Orders.Effect.TakeCover',
        affectedMembers: [],
    },
    render: (args) => renderCard(args),
};

export const Sweeping: Story = {
    name: 'Sergeant Sweeping Order broadcast — four-member squad',
    args: {
        gameSystem: 'ow',
        orderId: 'sgt-ranged-discipline',
        orderNameKey: 'WH40K.OW.Orders.Generic.RangedVolley',
        actionCostKey: 'WH40K.OW.Orders.ActionCost.Free',
        kindKey: 'WH40K.OW.Orders.Kind.Sweeping',
        sweeping: true,
        effectKey: 'WH40K.OW.Orders.Effect.RangedVolley',
        affectedMembers: [
            { id: 'cmd-01', name: 'Comrade Voss' },
            { id: 'cmd-02', name: 'Comrade Ren' },
            { id: 'cmd-03', name: 'Comrade Liska' },
            { id: 'cmd-04', name: 'Comrade Otrek' },
        ],
    },
    render: (args) => renderCard(args),
};
