/**
 * Stories for CyberneticSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as renderMockTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/item-cybernetic-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = HandlebarsLib.compile(templateSrc);
const rng = seedRandom(0xc7b3a1c);

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const id = randomId('cybernetic', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Mechadendrite (Basic)',
        type: 'cybernetic',
        img: 'icons/equipment/hand/gauntlet-armored-blue.webp',
        system: {
            type: 'mechadendrite',
            typeLabel: 'Mechadendrite',
            locations: [],
            locationsLabel: 'Back',
            craftsmanship: 'common',
            craftsmanshipLabel: 'Common Craftsmanship',
            corruption: 0,
            availability: 'scarce',
            weight: 2,
            installationDifficulty: 0,
            installationRequirements: '',
            removalConsequences: '',
            effect: '<p>A flexible tool-limb extending from the spine.</p>',
            modifiers: [],
            description: { value: '<p>A standard Mechanicus augmetic limb.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        source: item.system,
        canEdit: true,
        inEditMode: false,
        editable: true,
        effects: [],
        tabs: {
            properties: { id: 'properties', tab: 'properties', group: 'primary', active: true, cssClass: 'active' },
            installation: { id: 'installation', tab: 'installation', group: 'primary', active: false, cssClass: '' },
            modifiers: { id: 'modifiers', tab: 'modifiers', group: 'primary', active: false, cssClass: '' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/CyberneticSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderMockTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderMockTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersCyberneticName: Story = {
    render: () => renderMockTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByDisplayValue('Mechadendrite (Basic)')).toBeTruthy();
    },
};

export const RendersTypeLabel: Story = {
    render: () => renderMockTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        await expect(storyCanvas.getByText('Mechadendrite')).toBeTruthy();
    },
};
