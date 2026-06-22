/**
 * Stories for BaseItemSheet — the fallback generic item sheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-sheet.hbs?raw';

initializeStoryHandlebars();

const rng = seedRandom(0xba5e1);

interface BaseItemCtx {
    item: ReturnType<typeof mockItem>;
    system: { description: { value: string }; notes: string };
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    isOwnedByActor: boolean;
    effects: ReadonlyArray<never>;
    tabs: Record<string, { id: string; tab: string; group: string; label: string; active: boolean; cssClass: string }>;
}
function baseCtx(overrides: Partial<BaseItemCtx> = {}): BaseItemCtx {
    const id = randomId('base-item', rng);
    const item = mockItem({ _id: id, id, name: 'Imperial Aquila Icon', type: 'gear' });
    return {
        item,
        system: { description: { value: '<p>A blessed icon of the God-Emperor.</p>' }, notes: '' },
        canEdit: true,
        inEditMode: false,
        editable: true,
        isOwnedByActor: false,
        effects: [],
        tabs: {
            description: { id: 'description', tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description', active: true, cssClass: 'active' },
            effects: { id: 'effects', tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects', active: false, cssClass: '' },
        },
        ...overrides,
    };
}

const meta: Meta = {
    title: 'Item Sheets/BaseItemSheet',
};
export default meta;

type Story = StoryObj;

export const Default: Story = {
    render: () => renderSheet(templateSrc, baseCtx()),
};

export const EditMode: Story = {
    render: () => renderSheet(templateSrc, baseCtx({ inEditMode: true })),
};

export const RendersTitle: Story = {
    render: () => renderSheet(templateSrc, baseCtx()),
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Imperial Aquila Icon')).toBeTruthy();
    },
};

export const RendersDescriptionTab: Story = {
    render: () => renderSheet(templateSrc, baseCtx()),
    play: async ({ canvasElement }) => {
        const descTab = canvasElement.querySelector('[data-tab="description"]');
        await expect(descTab).toBeTruthy();
        await expect(descTab?.classList.contains('active')).toBe(true);
    },
};

// ── Per-system homologation ─────────────────────────────────────────────────
//
// `item-sheet.hbs` has no per-system variants itself, but the partials it pulls
// in (`item-header.hbs`, `item-tab-strip.hbs`, `description-panel.hbs`,
// `active-effects-panel.hbs`) gate their accent colours through per-system
// Tailwind variants (`bc:tw-* dh1:tw-* dh2:tw-* …`), which only fire when an
// ancestor carries `data-wh40k-system="<id>"`. The default `renderSheet`
// wrapper stamps `dh2`; these stories re-stamp it per game line so all seven
// palettes render. One story per system matches the file's existing
// one-export-per-case style.

function renderBaseItemForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, baseCtx());
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

export const PerSystemDH2: Story = {
    name: 'Per-system — DH2e',
    render: () => renderBaseItemForSystem('dh2'),
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Imperial Aquila Icon')).toBeTruthy();
    },
};

export const PerSystemDH1: Story = {
    name: 'Per-system — DH1',
    render: () => renderBaseItemForSystem('dh1'),
};

export const PerSystemRT: Story = {
    name: 'Per-system — Rogue Trader',
    render: () => renderBaseItemForSystem('rt'),
};

export const PerSystemBC: Story = {
    name: 'Per-system — Black Crusade',
    render: () => renderBaseItemForSystem('bc'),
};

export const PerSystemOW: Story = {
    name: 'Per-system — Only War',
    render: () => renderBaseItemForSystem('ow'),
};

export const PerSystemDW: Story = {
    name: 'Per-system — Deathwatch',
    render: () => renderBaseItemForSystem('dw'),
};

export const PerSystemIM: Story = {
    name: 'Per-system — Imperium Maledictum',
    render: () => renderBaseItemForSystem('im'),
    play: async ({ canvasElement }) => {
        const el = canvasElement.querySelector<HTMLElement>('[data-wh40k-system]');
        await expect(el?.dataset['wh40kSystem']).toBe('im');
    },
};
