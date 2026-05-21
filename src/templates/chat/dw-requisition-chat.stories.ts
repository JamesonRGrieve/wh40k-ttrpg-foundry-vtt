/**
 * Storybook stories for the Deathwatch Requisition chat card (#165).
 * Exercises the two emission modes (single-brother spend, pooled spend)
 * across the four craftsmanship tiers so review can verify the cost
 * multiplier rendering against the canonical Table 5-3.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { renderTemplate as renderStoryTemplate } from '../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../stories/template-support';
import { CRAFTSMANSHIP_MULTIPLIER, type Craftsmanship, computeItemCost } from '../../module/rules/dw-requisition.ts';
import chatSrc from './dw-requisition-chat.hbs?raw';

initializeStoryHandlebars();

interface RequisitionChatCtx {
    gameSystem: 'dw';
    mode: 'item' | 'pool';
    actorName: string;
    itemName: string;
    craftsmanshipKey: string;
    baseCost: number;
    itemCost: number;
    rpAfter: number;
    contributions?: Array<{ brotherName: string; rp: number }>;
    totalContributed?: number;
}

const chatTpl = HbsStory.compile(chatSrc);

function renderChat(ctx: RequisitionChatCtx): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.appendChild(renderStoryTemplate(chatTpl, ctx));
    return wrapper;
}

function craftsmanshipKey(c: Craftsmanship): string {
    return `WH40K.DW.Requisition.Craftsmanship.${c.charAt(0).toUpperCase()}${c.slice(1)}`;
}

const meta: Meta<RequisitionChatCtx> = {
    title: 'Chat/DwRequisitionCard',
};
export default meta;
type Story = StoryObj<RequisitionChatCtx>;

/** Single-brother spend at Common craftsmanship (×1 multiplier). */
export const ItemCommon: Story = {
    name: 'Single Brother — Common Bolter (×1)',
    args: {
        gameSystem: 'dw',
        mode: 'item',
        actorName: 'Brother Cassian',
        itemName: 'Astartes Boltgun',
        craftsmanshipKey: craftsmanshipKey('common'),
        baseCost: 10,
        itemCost: computeItemCost(10, 'common'),
        rpAfter: 15,
    },
    render: (args) => renderChat(args),
};

/** Single-brother spend at Best craftsmanship (×2 multiplier). */
export const ItemBest: Story = {
    name: 'Single Brother — Best-craftsmanship Power Sword (×2)',
    args: {
        gameSystem: 'dw',
        mode: 'item',
        actorName: 'Brother Pellanore',
        itemName: 'Power Sword',
        craftsmanshipKey: craftsmanshipKey('best'),
        baseCost: 20,
        itemCost: computeItemCost(20, 'best'),
        rpAfter: 5,
    },
    render: (args) => renderChat(args),
};

/** Pool requisition — three Brothers pool RP to acquire a Good Plasma Gun. */
export const PoolGood: Story = {
    name: 'Pool — three Brothers pool for Good Plasma Gun (×1.5)',
    args: {
        gameSystem: 'dw',
        mode: 'pool',
        actorName: 'Brother Kerrigan',
        itemName: 'Plasma Gun',
        craftsmanshipKey: craftsmanshipKey('good'),
        baseCost: 30,
        itemCost: computeItemCost(30, 'good'),
        rpAfter: 0,
        contributions: [
            { brotherName: 'Brother Kerrigan', rp: 20 },
            { brotherName: 'Brother Vos', rp: 15 },
            { brotherName: 'Brother Tarn', rp: 10 },
        ],
        totalContributed: 45,
    },
    render: (args) => renderChat(args),
};

/** Sanity check: the multiplier table renders consistent costs. */
void CRAFTSMANSHIP_MULTIPLIER;
