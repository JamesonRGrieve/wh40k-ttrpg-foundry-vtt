/**
 * Stories for ForceFieldSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-force-field-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0xf03ce1d);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('forcefield', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Conversion Field',
        type: 'forceField',
        img: 'icons/magic/light/orb-globe-gold.webp',
        system: {
            protectionRating: 50,
            overloadChance: 5,
            activated: true,
            overloaded: false,
            statusLabel: 'Active',
            craftsmanship: 'good',
            craftsmanshipLabel: 'Good Craftsmanship',
            availability: 'very-rare',
            weight: 2,
            description: { value: '<p>Converts kinetic energy to light.</p>' },
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
            stats: { id: 'stats', tab: 'stats', group: 'primary', active: true, cssClass: 'active' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/ForceFieldSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const Overloaded: Story = {
    render: () =>
        renderTemplate(
            compiled,
            makeCtx({
                system: {
                    protectionRating: 50,
                    overloadChance: 5,
                    activated: false,
                    overloaded: true,
                    statusLabel: 'Overloaded',
                    craftsmanship: 'good',
                    craftsmanshipLabel: 'Good Craftsmanship',
                    availability: 'very-rare',
                    weight: 2,
                },
            }),
        ),
};

export const RendersFieldName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Conversion Field')).toBeTruthy();
    },
};

export const RendersStatusBadge: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Active')).toBeTruthy();
    },
};
