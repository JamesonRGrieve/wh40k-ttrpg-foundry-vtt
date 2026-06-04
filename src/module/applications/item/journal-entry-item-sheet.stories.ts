/**
 * Stories for JournalEntryItemSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-journal-entry-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xd0c5a3e);

interface JournalSheetCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}
function makeCtx(overrides: Partial<JournalSheetCtx> = {}): JournalSheetCtx {
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

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersTitle: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(cv.getByDisplayValue('Encounter at Ore Processor 12')).toBeTruthy();
    },
};

export const RendersLocationField: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.place"]');
        void expect(field).toBeTruthy();
        void expect(field?.value).toBe('Ore Processing District');
    },
};
