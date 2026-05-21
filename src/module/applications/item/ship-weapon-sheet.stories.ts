/**
 * Stories for ShipWeaponSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HB from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as compileAndRender } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/ship-weapon-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = HB.compile(templateSrc);
const rng = seedRandom(0x5a5b5c5);

interface ShipWeaponCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    weaponTypes: Record<string, { label: string }>;
    locations: Record<string, { label: string }>;
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    effects: object[];
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}

function makeCtx(overrides: Partial<ShipWeaponCtx> = {}): ShipWeaponCtx {
    const id = randomId('ship-wpn', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Prow Lance Battery',
        type: 'shipWeapon',
        system: {
            weaponType: 'lance',
            location: 'prow',
            powerDraw: 6,
            spaceRequired: 4,
            shipPoints: 4,
            strength: 1,
            damage: '1d10+4',
            damageType: 'Energy',
            crit: 4,
            range: 'long',
            availability: 'rare',
            description: { value: '<p>A fearsome beam weapon capable of piercing void shields.</p>' },
            effect: '<p>Ignores void shields on a hit.</p>',
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        weaponTypes: {
            macrobattery: { label: 'Macrobattery' },
            lance: { label: 'Lance' },
            torpedo: { label: 'Torpedo' },
            nova: { label: 'Nova Cannon' },
        },
        locations: {
            prow: { label: 'Prow' },
            dorsal: { label: 'Dorsal' },
            port: { label: 'Port' },
            starboard: { label: 'Starboard' },
            keel: { label: 'Keel' },
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

const meta: Meta = { title: 'Item Sheets/ShipWeaponSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => compileAndRender(compiled, makeCtx()) };

export const EditMode: Story = { render: () => compileAndRender(compiled, makeCtx({ inEditMode: true })) };

export const RendersWeaponName: Story = {
    render: () => compileAndRender(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const view = within(canvasElement);
        await expect(view.getByDisplayValue('Prow Lance Battery')).toBeTruthy();
    },
};

export const RendersDetailsTabActive: Story = {
    render: () => compileAndRender(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="details"]');
        await expect(tab).toBeTruthy();
        await expect(tab?.classList.contains('active')).toBe(true);
    },
};
