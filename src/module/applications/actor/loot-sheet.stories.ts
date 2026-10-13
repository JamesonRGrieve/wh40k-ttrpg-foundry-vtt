/**
 * Stories for LootActorSheet — the content-agnostic loot pile. Covers the
 * populated pile (header + source + take-everything + item rows) and the
 * empty pile (disabled take-all + empty state). The loot pile has no
 * per-system variance by design (a single homologated `loot` type serves all
 * seven lines), so no `withSystem` variant is needed here.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import lootSrc from '../../../templates/actor/loot/loot-sheet.hbs?raw';

initializeStoryHandlebars();

interface LootStoryCtx {
    actor: { name: string; img: string };
    lootItems: Array<{ id: string; name: string; img: string; type: string; quantity: number | null; weight: number | null }>;
    lootTotalWeight: number;
    lootSource: string;
    isEmpty: boolean;
    portraitJournal?: { uuid: string; canClear: boolean } | null;
}

/** The fraction of `outer`'s area that `inner` covers. */
function coveredFraction(inner: DOMRect, outer: DOMRect): number {
    const width = Math.max(0, Math.min(inner.right, outer.right) - Math.max(inner.left, outer.left));
    const height = Math.max(0, Math.min(inner.bottom, outer.bottom) - Math.max(inner.top, outer.top));
    return (width * height) / (outer.width * outer.height);
}

/**
 * The most of the 40px thumbnail the compact journal controls may cover. The
 * corner-hung column covers ~19%; the old in-image row covered ~41% (#590 follow-up).
 */
const MAX_THUMBNAIL_COVERAGE = 0.25;

function renderLootSheet(ctx: LootStoryCtx): HTMLElement {
    return renderSheet(lootSrc, ctx);
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
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByText('Dropped: Bolt Pistol')).toBeVisible();
        await expect(withinCanvas.getByText('Bolt Pistol')).toBeVisible();
        await expect(withinCanvas.getByText('Bolt Shells')).toBeVisible();
        const takeAll = canvasElement.querySelector<HTMLButtonElement>('[data-action="pickupAll"]');
        await expect(takeAll).not.toBeNull();
        await expect((takeAll as HTMLButtonElement).disabled).toBe(false);
        await expect(canvasElement.querySelector('[data-action="itemDelete"][data-item-id="i2"]')).not.toBeNull();
        await expect(canvasElement.querySelector('[data-wh40k-hook="loot-list"]')).not.toBeNull();
    },
};

export const LinkedJournal: Story = {
    name: 'Linked journal (owner) — compact portrait controls',
    args: { ...populatedCtx, portraitJournal: { uuid: 'JournalEntry.aaaaaaaaaaaaaaaa', canClear: true } },
    render: (args) => renderLootSheet(args),
    play: async ({ canvasElement }) => {
        const portrait = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="actor-portrait"]');
        const open = portrait?.querySelector<HTMLButtonElement>('[data-action="openPortraitJournal"]') ?? null;
        const clear = portrait?.querySelector<HTMLButtonElement>('[data-action="clearPortraitJournal"]') ?? null;
        await expect(open).not.toBeNull();
        await expect(clear).not.toBeNull();
        const image = portrait?.querySelector('img');
        if (open === null || clear === null || image == null) return;
        // The controls hang off the thumbnail's corner rather than covering it.
        const imageRect = image.getBoundingClientRect();
        // A real layout only: without one every rect is empty and there is nothing to measure.
        if (imageRect.width === 0) return;
        const covered = coveredFraction(open.getBoundingClientRect(), imageRect) + coveredFraction(clear.getBoundingClientRect(), imageRect);
        await expect(covered).toBeLessThanOrEqual(MAX_THUMBNAIL_COVERAGE);
    },
};

export const Empty: Story = {
    name: 'Empty — disabled take-all + empty state',
    args: emptyCtx,
    render: (args) => renderLootSheet(args),
    play: async ({ canvasElement }) => {
        const takeAll = canvasElement.querySelector<HTMLButtonElement>('[data-action="pickupAll"]');
        await expect(takeAll).not.toBeNull();
        await expect(takeAll?.disabled).toBe(true);
        await expect(canvasElement.querySelectorAll('tr[data-item-id]').length).toBe(0);
    },
};
