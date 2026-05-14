/**
 * Stories for ShipComponentSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/ship-component-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x5c0a200);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('ship-comp', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Jovian Pattern Drive',
        type: 'shipComponent',
        img: 'icons/equipment/chest/breastplate-riveted-steel.webp',
        system: {
            componentType: 'drive',
            hullType: 'frigate',
            powerDraw: 15,
            spaceRequired: 10,
            shipPoints: 3,
            availability: 'common',
            origin: 'Mars',
            description: { value: '<p>A reliable void-drive pattern common on Rogue Trader vessels.</p>' },
            effect: '',
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        componentTypes: {
            drive: { label: 'Drive' },
            hull: { label: 'Hull' },
            weapon: { label: 'Weapon' },
            augur: { label: 'Augur Array' },
        },
        hullTypes: {
            frigate: { label: 'Frigate' },
            cruiser: { label: 'Cruiser' },
            transport: { label: 'Transport' },
        },
        canEdit: true,
        inEditMode: false,
        editable: true,
        effects: [],
        tabs: {
            details: { id: 'details', tab: 'details', group: 'primary', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/ShipComponentSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersComponentName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Jovian Pattern Drive')).toBeTruthy();
    },
};

export const RendersDetailsTab: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="details"]');
        expect(tab).toBeTruthy();
        expect(tab?.classList.contains('active')).toBe(true);
    },
};
