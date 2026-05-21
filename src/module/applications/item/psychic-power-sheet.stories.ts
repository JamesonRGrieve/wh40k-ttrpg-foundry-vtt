/**
 * Stories for PsychicPowerSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import HbsLib from 'handlebars';
import { expect, within } from 'storybook/test';
import { mockItem, renderTemplate as renderStoryTemplate } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import templateSrc from '../../../templates/item/item-psychic-power-sheet.hbs?raw';

initializeStoryHandlebars();
const compiled = HbsLib.compile(templateSrc);
const rng = seedRandom(0x5a1e71);

function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

export const Default: Story = { render: () => renderStoryTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderStoryTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersPowerName: Story = {
    render: () => renderStoryTemplate(compiled, makeCtx()),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Smite')).toBeTruthy();
    },
};

export const RendersDisciplineBadge: Story = {
    render: () => renderStoryTemplate(compiled, makeCtx()),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByText('Biomancy Power')).toBeTruthy();
    },
};
