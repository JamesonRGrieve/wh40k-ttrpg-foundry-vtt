/**
 * Stories for PsychicPowerSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-psychic-power-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0x5a1e71);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('psychic', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Smite',
        type: 'psychicPower',
        img: 'icons/magic/lightning/bolt-blue.webp',
        system: {
            discipline: 'Biomancy',
            subtype: 'Attack',
            action: 'Half',
            focus: 'Willpower',
            range: '20m',
            sustainedEffect: '',
            damageFormula: '1d10+PR',
            damageType: 'Energy',
            overbleed: false,
            source: 'Dark Heresy 2e Core',
            description: { value: '<p>Blast foes with pure psychic force.</p>' },
        },
    });
    return {
        item,
        system: item.system,
        canEdit: true,
        inEditMode: false,
        editable: true,
        effects: [],
        tabs: {
            details: { id: 'details', tab: 'details', group: 'primary', active: true, cssClass: 'active' },
            description: { id: 'description', tab: 'description', group: 'primary', active: false, cssClass: '' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/PsychicPowerSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersPowerName: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Smite')).toBeTruthy();
    },
};

export const RendersDisciplineBadge: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByText('Biomancy Power')).toBeTruthy();
    },
};
