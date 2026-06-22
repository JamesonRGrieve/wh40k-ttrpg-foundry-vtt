/**
 * Stories for JournalEntryItemSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet, renderSheetParts } from '../../../../stories/test-helpers';
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

// ── Per-system homologation ───────────────────────────────────────────────────
//
// item-journal-entry-sheet.hbs gates its heading/icon accent colour with
// `<id>:tw-*` variant chains (`bc:tw-text-crimson-light dh1:tw-text-gold-raw-l5
// …`) that only fire when an ancestor carries `data-wh40k-system="<id>"`.
// `renderSheetParts` stamps that attribute, so rendering the template under each
// of the seven game lines exercises every variant — catching a "works in DH2 but
// not the other six" regression. One story export per system keeps the file's
// compact style.

const ALL_SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

function renderForSystem(systemId: SystemId): HTMLElement {
    return renderSheetParts([{ template: templateSrc }], makeCtx(), { systemId });
}

export const PerSystemDh2: Story = { name: 'Per-system — DH2e', render: () => renderForSystem('dh2') };
export const PerSystemDh1: Story = { name: 'Per-system — DH1', render: () => renderForSystem('dh1') };
export const PerSystemRt: Story = { name: 'Per-system — Rogue Trader', render: () => renderForSystem('rt') };
export const PerSystemBc: Story = { name: 'Per-system — Black Crusade', render: () => renderForSystem('bc') };
export const PerSystemOw: Story = { name: 'Per-system — Only War', render: () => renderForSystem('ow') };
export const PerSystemDw: Story = { name: 'Per-system — Deathwatch', render: () => renderForSystem('dw') };
export const PerSystemIm: Story = { name: 'Per-system — Imperium Maledictum', render: () => renderForSystem('im') };

export const PerSystemAllRenderTitle: Story = {
    name: 'Per-system — every line renders the entry title',
    render: () => renderForSystem('dh2'),
    play: () => {
        for (const systemId of ALL_SYSTEMS) {
            const root = renderForSystem(systemId);
            void expect(root.dataset['wh40kSystem']).toBe(systemId);
            const cv = within(root);
            void expect(cv.getByDisplayValue('Encounter at Ore Processor 12')).toBeTruthy();
        }
    },
};
