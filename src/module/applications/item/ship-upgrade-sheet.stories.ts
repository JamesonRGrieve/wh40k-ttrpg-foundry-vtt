/**
 * Stories for ShipUpgradeSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/ship-upgrade-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x5a1b2c3);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('ship-upg', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Tenacious History',
        type: 'shipUpgrade',
        system: {
            upgradeType: 'history',
            availability: 'common',
            effect: '<p>Gain +5 to all hull integrity repair rolls.</p>',
            description: { value: '<p>This vessel has weathered storms that would have claimed lesser craft.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        availabilities: {
            common: { label: 'Common' },
            uncommon: { label: 'Uncommon' },
            rare: { label: 'Rare' },
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

const meta: Meta = { title: 'Item Sheets/ShipUpgradeSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersUpgradeName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Tenacious History')).toBeTruthy();
    },
};

export const RendersDetailsTabActive: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const tab = canvasElement.querySelector('[data-tab="details"]');
        expect(tab).toBeTruthy();
        expect(tab?.classList.contains('active')).toBe(true);
    },
};
