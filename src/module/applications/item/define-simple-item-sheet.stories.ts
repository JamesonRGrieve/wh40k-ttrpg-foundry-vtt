/**
 * Stories for defineSimpleItemSheet — the factory itself, exercised via a
 * representative SimpleSheet (weapon-mod as a stand-in).  The factory is
 * infrastructure, not a visual component, so these stories verify the contract:
 * correct class name, tab list, and template wiring.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet, renderSheetParts } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-weapon-mod-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xd3f100);

interface SimpleSheetCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    source: ReturnType<typeof mockItem>['system'];
    dh: { items: { availability: Record<string, { label: string }> } };
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
}
function makeCtx(overrides: Partial<SimpleSheetCtx> = {}): SimpleSheetCtx {
    const id = randomId('simple', rng);
    const item = mockItem({ _id: id, id, name: 'Forearm Bayonet', type: 'weaponMod', system: { weight: 0.2, availability: 'common' } });
    return {
        item,
        system: item.system,
        source: item.system,
        dh: { items: { availability: { common: { label: 'Common' }, scarce: { label: 'Scarce' } } } },
        canEdit: true,
        inEditMode: false,
        editable: true,
        ...overrides,
    };
}

const meta: Meta = { title: 'Item Sheets/DefineSimpleItemSheet' };
export default meta;

type Story = StoryObj;

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersItemName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="name"]');
        await expect(field).toBeTruthy();
        await expect(field?.value).toBe('Forearm Bayonet');
    },
};

export const RendersWeightField: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const field = canvasElement.querySelector<HTMLInputElement>('[name="system.weight"]');
        await expect(field).toBeTruthy();
        await expect(field?.value).toBe('0.2');
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// item-weapon-mod-sheet.hbs gates its accent colour with `<id>:tw-*` variant
// chains (`bc:tw-text-crimson-light dh1:tw-text-gold-raw-l5 …`), which only fire
// when an ancestor carries `data-wh40k-system="<id>"`. `renderSheetParts` stamps
// that attribute, so rendering the template under each of the seven game lines
// exercises every variant — catching a "works in DH2 but not the other six"
// regression. One story export per system keeps the file's compact style.

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

export const PerSystemAllRenderName: Story = {
    name: 'Per-system — every line renders the item name',
    render: () => renderForSystem('dh2'),
    play: () => {
        for (const systemId of ALL_SYSTEMS) {
            const root = renderForSystem(systemId);
            void expect(root.dataset['wh40kSystem']).toBe(systemId);
            const field = root.querySelector<HTMLInputElement>('[name="name"]');
            void expect(field?.value).toBe('Forearm Bayonet');
        }
    },
};
