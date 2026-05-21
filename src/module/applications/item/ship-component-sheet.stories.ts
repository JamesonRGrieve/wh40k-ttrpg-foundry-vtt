/**
 * Stories for ShipComponentSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsStory from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/ship-component-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = HbsStory.compile(templateSrc);
const rng = seedRandom(0x5c0a200);

interface TabEntry {
    id: string;
    tab: string;
    group: string;
    active: boolean;
    cssClass: string;
}

interface ShipComponentCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    componentTypes: Record<string, { label: string }>;
    hullTypes: Record<string, { label: string }>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    effects: never[];
    tabs: Record<string, TabEntry>;
}

function makeCtx(overrides: Partial<ShipComponentCtx> = {}): ShipComponentCtx {
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

export const Default: Story = { render: () => renderStoryTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderStoryTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersComponentName: Story = {
    render: () => renderStoryTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Jovian Pattern Drive')).toBeTruthy();
    },
};

export const RendersDetailsTab: Story = {
    render: () => renderStoryTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="details"]');
        await expect(tab).toBeTruthy();
        await expect(tab?.classList.contains('active')).toBe(true);
    },
};
