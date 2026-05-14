/**
 * Stories for BaseItemSheet — the fallback generic item sheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);

const rng = seedRandom(0xba5e1);

function baseCtx(overrides: Record<string, unknown> = {}) {
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
    render: () => renderTemplate(compiled, baseCtx()),
};

export const EditMode: Story = {
    render: () => renderTemplate(compiled, baseCtx({ inEditMode: true })),
};

export const RendersTitle: Story = {
    render: () => renderTemplate(compiled, baseCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Imperial Aquila Icon')).toBeTruthy();
    },
};

export const RendersDescriptionTab: Story = {
    render: () => renderTemplate(compiled, baseCtx()),
    play: async ({ canvasElement }) => {
        const descTab = canvasElement.querySelector('[data-tab="description"]');
        expect(descTab).toBeTruthy();
        expect(descTab?.classList.contains('active')).toBe(true);
    },
};
