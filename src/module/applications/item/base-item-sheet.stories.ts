/**
 * Stories for BaseItemSheet — the fallback generic item sheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-sheet.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xba5e1);

interface BaseItemCtx {
    item: ReturnType<typeof mockItem>;
    system: { description: { value: string }; notes: string };
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    isOwnedByActor: boolean;
    effects: ReadonlyArray<never>;
    tabs: Record<string, { id: string; tab: string; group: string; label: string; active: boolean; cssClass: string }>;
}
function baseCtx(overrides: Partial<BaseItemCtx> = {}): BaseItemCtx {
    const id = randomId('base-item', rng);
    const item = mockItem({ _id: id, id, name: 'Imperial Aquila Icon', type: 'gear' });
    return {
        item,
        system: { description: { value: '<p>A blessed icon of the God-Emperor.</p>' }, notes: '' },
        canEdit: true,
        inEditMode: false,
        editable: true,
        isOwnedByActor: false,
        effects: [],
        tabs: {
            description: { id: 'description', tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = {
    title: 'Item Sheets/BaseItemSheet',
};
export default meta;

type Story = StoryObj;

export const Default: Story = {
    render: () => renderSheet(templateSrc, baseCtx()),
};

export const EditMode: Story = {
    render: () => renderSheet(templateSrc, baseCtx({ inEditMode: true })),
};

export const RendersTitle: Story = {
    render: () => renderSheet(templateSrc, baseCtx()),
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Imperial Aquila Icon')).toBeTruthy();
    },
};

export const RendersDescriptionTab: Story = {
    render: () => renderSheet(templateSrc, baseCtx()),
    play: async ({ canvasElement }) => {
        const descTab = canvasElement.querySelector('[data-tab="description"]');
        await expect(descTab).toBeTruthy();
        await expect(descTab?.classList.contains('active')).toBe(true);
    },
};
