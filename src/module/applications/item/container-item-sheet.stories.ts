/**
 * Stories for ContainerItemSheet — the base for sheets holding nested items.
 * Uses the generic item-sheet template (the fallback used when ContainerItemSheet
 * is instantiated without a subclass override).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HB from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as compileAndRender } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/item-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = HB.compile(templateSrc);
const rng = seedRandom(0xc0a1be7);

interface ContainerCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    isContainer: boolean;
    nestedItems: ReturnType<typeof mockItem>[];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    isOwnedByActor: boolean;
    effects: unknown[];
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}

function makeCtx(overrides: Partial<ContainerCtx> = {}): ContainerCtx {
    const id = randomId('container', rng);
    const nested1 = mockItem({ name: 'Small Knife', type: 'gear' });
    const nested2 = mockItem({ name: 'Lho-sticks', type: 'gear' });
    const item = mockItem({
        _id: id,
        id,
        name: "Rogue Trader's Chest",
        type: 'gear',
        system: { container: true, description: { value: '<p>A battered iron-bound chest.</p>' } },
    });
    return {
        item,
        system: item.system,
        isContainer: true,
        nestedItems: [nested1, nested2],
        canEdit: true,
        inEditMode: false,
        editable: true,
        isOwnedByActor: false,
        effects: [],
        tabs: {
            description: { id: 'description', tab: 'description', group: 'primary', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/ContainerItemSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => compileAndRender(compiled, makeCtx()) };

export const Empty: Story = {
    render: () => compileAndRender(compiled, makeCtx({ nestedItems: [] })),
};

export const RendersContainerName: Story = {
    render: () => compileAndRender(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue("Rogue Trader's Chest")).toBeTruthy();
    },
};

export const RendersDescriptionTab: Story = {
    render: () => compileAndRender(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="description"]');
        await expect(tab).toBeTruthy();
        await expect(tab?.classList.contains('active')).toBe(true);
    },
};
