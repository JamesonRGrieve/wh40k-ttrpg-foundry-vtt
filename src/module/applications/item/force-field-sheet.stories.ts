/**
 * Stories for ForceFieldSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet, renderSheetParts } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-force-field-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0xf03ce1d);

// eslint-disable-next-line no-restricted-syntax -- boundary: story overrides for freeform template testing
function makeCtx(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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
            state: { activated: true, overloaded: false },
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

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const Overloaded: Story = {
    render: () =>
        renderSheet(
            templateSrc,
            makeCtx({
                system: {
                    protectionRating: 50,
                    overloadChance: 5,
                    state: { activated: false, overloaded: true },
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
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const queries = within(canvasElement);
        await expect(queries.getByDisplayValue('Conversion Field')).toBeTruthy();
    },
};

export const RendersStatusBadge: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: async ({ canvasElement }) => {
        const queries = within(canvasElement);
        await expect(queries.getByText('Active')).toBeTruthy();
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// item-force-field-sheet.hbs gates its accent colour with `<id>:tw-*` variant
// chains (`bc:tw-text-crimson-light dh1:tw-text-gold-raw-l5 …`) that only fire
// when an ancestor carries `data-wh40k-system="<id>"`. `renderSheetParts` stamps
// that attribute, so rendering the template under each of the seven game lines
// exercises every variant — surfacing a "works in DH2 but not the other six"
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

export const PerSystemAllRenderStatus: Story = {
    name: 'Per-system — every line renders the status badge',
    render: () => renderForSystem('dh2'),
    play: () => {
        for (const systemId of ALL_SYSTEMS) {
            const root = renderForSystem(systemId);
            void expect(root.dataset['wh40kSystem']).toBe(systemId);
            const queries = within(root);
            void expect(queries.getByDisplayValue('Conversion Field')).toBeTruthy();
            void expect(queries.getByText('Active')).toBeTruthy();
        }
    },
};
