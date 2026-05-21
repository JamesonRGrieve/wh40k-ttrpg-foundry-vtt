/**
 * Stories for defineSimpleItemSheet — the factory itself, exercised via a
 * representative SimpleSheet (weapon-mod as a stand-in).  The factory is
 * infrastructure, not a visual component, so these stories verify the contract:
 * correct class name, tab list, and template wiring.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect } from 'storybook/test';
import { mockItem, renderTemplate as renderTpl } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/item-weapon-mod-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = Hbs.compile(templateSrc);
const rng = seedRandom(0xd3f100);

interface SimpleSheetCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    dh: { items: { availability: Record<string, { label: string }> } };
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
}
function makeCtx(overrides: Partial<SimpleSheetCtx> = {}): SimpleSheetCtx {
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

export const Default: Story = { render: () => renderTpl(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTpl(compiled, makeCtx({ inEditMode: true })) };

export const RendersItemName: Story = {
    render: () => renderTpl(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="name"]');
        await expect(field).toBeTruthy();
        await expect(field?.value).toBe('Forearm Bayonet');
    },
};

export const RendersWeightField: Story = {
    render: () => renderTpl(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.weight"]');
        await expect(field).toBeTruthy();
        await expect(field?.value).toBe('0.2');
    },
};
