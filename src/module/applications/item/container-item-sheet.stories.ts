/**
 * Stories for ContainerItemSheet — the base for sheets holding nested items.
 * Uses the generic item-sheet template (the fallback used when ContainerItemSheet
 * is instantiated without a subclass override).
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
const rng = seedRandom(0xc0a1be7);

function makeCtx(overrides: Record<string, unknown> = {}) {
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

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const Empty: Story = {
    render: () => renderTemplate(compiled, makeCtx({ nestedItems: [] })),
};

export const RendersContainerName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue("Rogue Trader's Chest")).toBeTruthy();
    },
};

export const RendersDescriptionTab: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="description"]');
        expect(tab).toBeTruthy();
        expect(tab?.classList.contains('active')).toBe(true);
    },
};
