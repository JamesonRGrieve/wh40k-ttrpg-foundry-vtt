/**
 * Stories for LootActorSheet — the content-agnostic loot pile. Covers the
 * populated pile (header + source + take-everything + item rows) and the
 * empty pile (disabled take-all + empty state). The loot pile has no
 * per-system variance by design (a single homologated `loot` type serves all
 * seven lines), so no `withSystem` variant is needed here.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';

import lootSrc from '../../../templates/actor/loot/loot-sheet.hbs?raw';
import { renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';

initializeStoryHandlebars();

const lootTpl = Handlebars.compile(lootSrc);

interface LootStoryCtx {
    actor: { name: string; img: string };
    lootItems: Array<{ id: string; name: string; img: string; type: string; quantity: number | null; weight: number | null }>;
    lootTotalWeight: number;
    lootSource: string;
    isEmpty: boolean;
}

function renderLootSheet(ctx: LootStoryCtx): HTMLElement {
    return renderTemplate(lootTpl, ctx);
}

const meta: Meta<LootStoryCtx> = {
    title: 'Actor/LootActorSheet',
};
export default meta;
type Story = StoryObj<LootStoryCtx>;

const populatedCtx: LootStoryCtx = {
    actor: { name: 'Dropped: Bolt Pistol', img: 'icons/svg/item-bag.svg' },
    lootItems: [
        { id: 'i1', name: 'Bolt Pistol', img: 'icons/svg/sword.svg', type: 'weapon', quantity: null, weight: 5.5 },
        { id: 'i2', name: 'Bolt Shells', img: 'icons/svg/item-bag.svg', type: 'ammunition', quantity: 24, weight: 0.1 },
    ],
    lootTotalWeight: 7.9,
    lootSource: 'Dropped by Interrogator Hredel',
    isEmpty: false,
};

const emptyCtx: LootStoryCtx = {
    actor: { name: 'Loot Pile', img: 'icons/svg/item-bag.svg' },
    lootItems: [],
    lootTotalWeight: 0,
    lootSource: '',
    isEmpty: true,
};

export const Populated: Story = {
    name: 'Populated — weapon + ammunition stack',
    args: populatedCtx,
    render: (args) => renderLootSheet(args),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        await expect(canvas.getByText('Dropped: Bolt Pistol')).toBeVisible();
        await expect(canvas.getByText('Bolt Pistol')).toBeVisible();
        await expect(canvas.getByText('Bolt Shells')).toBeVisible();
        const takeAll = canvasElement.querySelector('[data-action="pickupAll"]');
        await expect(takeAll).not.toBeNull();
        await expect((takeAll as HTMLButtonElement).disabled).toBe(false);
        // Per-row take/delete control wired to the inherited base action.
        await expect(canvasElement.querySelector('[data-action="itemDelete"][data-item-id="i2"]')).not.toBeNull();
    },
};

export const Empty: Story = {
    name: 'Empty — disabled take-all + empty state',
    args: emptyCtx,
    render: (args) => renderLootSheet(args),
    play: async ({ canvasElement }) => {
        const takeAll = canvasElement.querySelector('[data-action="pickupAll"]') as HTMLButtonElement | null;
        await expect(takeAll).not.toBeNull();
        await expect(takeAll?.disabled).toBe(true);
        await expect(canvasElement.querySelectorAll('tr[data-item-id]').length).toBe(0);
    },
};
