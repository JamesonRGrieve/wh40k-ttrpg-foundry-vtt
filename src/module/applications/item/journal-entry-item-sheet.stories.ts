/**
 * Stories for JournalEntryItemSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-journal-entry-sheet.hbs?raw';
import { mockItem, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);
const rng = seedRandom(0xd0c5a3e);

function makeCtx(overrides: Record<string, unknown> = {}) {
    const id = randomId('journal', rng);
    const item = mockItem({
        _id: id,
        id,
        name: 'Encounter at Ore Processor 12',
        type: 'journalEntry',
        system: {
            time: '2025-01-15',
            place: 'Ore Processing District',
            content: { value: '<p>The acolytes discovered a concealed access hatch...</p>' },
            notes: '',
        },
    });
    return {
        item,
        system: item.system,
        canEdit: true,
        inEditMode: false,
        editable: true,
        tabs: {
            content: { id: 'content', tab: 'content', group: 'primary', active: true, cssClass: 'active' },
        },
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/JournalEntryItemSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderTemplate(compiled, makeCtx()) };

export const EditMode: Story = { render: () => renderTemplate(compiled, makeCtx({ inEditMode: true })) };

export const RendersTitle: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Encounter at Ore Processor 12')).toBeTruthy();
    },
};

export const RendersLocationField: Story = {
    render: () => renderTemplate(compiled, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.place"]');
        expect(field).toBeTruthy();
        expect(field?.value).toBe('Ore Processing District');
    },
};
