/**
 * Stories for defineSimpleItemSheet — the factory itself, exercised via a
 * representative SimpleSheet (weapon-mod as a stand-in).  The factory is
 * infrastructure, not a visual component, so these stories verify the contract:
 * correct class name, tab list, and template wiring.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect } from 'storybook/test';
import templateSrc from '../../../templates/item/item-weapon-mod-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0xd3f100);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('simple', rng);
    const item = mockItem({ _id: id, id, name: 'Forearm Bayonet', type: 'weaponMod', system: { weight: 0.2, availability: 'common' } });
    return {
        item,
        system: item.system,
        source: item.system,
        dh: { items: { availability: { common: { label: 'Common' }, scarce: { label: 'Scarce' } } } },
        canEdit: true,
        inEditMode: false,
        editable: true,
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/DefineSimpleItemSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersItemName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="name"]');
        expect(field).toBeTruthy();
        expect(field?.value).toBe('Forearm Bayonet');
    },
};

export const RendersWeightField: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.weight"]');
        expect(field).toBeTruthy();
        expect(field?.value).toBe('0.2');
    },
};
