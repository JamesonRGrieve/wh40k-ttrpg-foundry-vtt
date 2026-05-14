/**
 * Stories for WeaponModSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-weapon-mod-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0xba55d);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('weapon-mod', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Red-Dot Sight',
        type: 'weaponMod',
        system: {
            category: 'sight',
            weight: 0.5,
            availability: 'scarce',
            modifiers: { toHit: 10 },
            restrictions: '',
            effect: '<p>+10 to hit at short and standard range.</p>',
            description: { value: '<p>A reliable targeting aide.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        dh: {
            items: {
                availability: {
                    common: { label: 'Common' },
                    scarce: { label: 'Scarce' },
                    rare: { label: 'Rare' },
                },
            },
        },
        canEdit: true,
        inEditMode: false,
        editable: true,
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/WeaponModSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Red-Dot Sight')).toBeTruthy();
    },
};

export const RendersWeightField: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.weight"]');
        expect(field).toBeTruthy();
        expect(field?.value).toBe('0.5');
    },
};
