/**
 * Stories for PsychicPowerSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem } from '../../../../stories/mocks';
import { seedRandom, randomId, type SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-psychic-power-sheet.hbs?raw';

initializeStoryHandlebars();
const rng = seedRandom(0x5a1e71);

interface PsychicPowerCtx {
    item: ReturnType<typeof mockItem>;
    system: ReturnType<typeof mockItem>['system'];
    canEdit: boolean;
    inEditMode: boolean;
    editable: boolean;
    effects: ReadonlyArray<never>;
    tabs: Record<string, { id: string; tab: string; group: string; active: boolean; cssClass: string }>;
}
function makeCtx(overrides: Partial<PsychicPowerCtx> = {}): PsychicPowerCtx {
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

export const Default: Story = { render: () => renderSheet(templateSrc, makeCtx()) };

export const EditMode: Story = { render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })) };

export const RendersPowerName: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Smite')).toBeTruthy();
    },
};

export const RendersDisciplineBadge: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByText('Biomancy Power')).toBeTruthy();
    },
};

// ── Per-system homologation ─────────────────────────────────────────────────
//
// The template gates its accent colours through per-system Tailwind variants
// (`bc:tw-text-crimson-light dh1:tw-text-gold-raw-l5 dh2:tw-text-gold-raw …`),
// which only fire when an ancestor carries `data-wh40k-system="<id>"`. The
// default `renderSheet` wrapper stamps `dh2`; these variants re-stamp it per
// game line so all seven palettes are exercised. One story per system keeps the
// pattern compact and matches the file's existing one-export-per-case style.

function renderPsychicForSystem(systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, makeCtx());
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

export const PerSystemDH2: Story = {
    name: 'Per-system — DH2e',
    render: () => renderPsychicForSystem('dh2'),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Smite')).toBeTruthy();
    },
};

export const PerSystemDH1: Story = {
    name: 'Per-system — DH1',
    render: () => renderPsychicForSystem('dh1'),
};

export const PerSystemRT: Story = {
    name: 'Per-system — Rogue Trader',
    render: () => renderPsychicForSystem('rt'),
};

export const PerSystemBC: Story = {
    name: 'Per-system — Black Crusade',
    render: () => renderPsychicForSystem('bc'),
};

export const PerSystemOW: Story = {
    name: 'Per-system — Only War',
    render: () => renderPsychicForSystem('ow'),
};

export const PerSystemDW: Story = {
    name: 'Per-system — Deathwatch',
    render: () => renderPsychicForSystem('dw'),
};

export const PerSystemIM: Story = {
    name: 'Per-system — Imperium Maledictum',
    render: () => renderPsychicForSystem('im'),
    play: ({ canvasElement }) => {
        const el = canvasElement.querySelector<HTMLElement>('[data-wh40k-system]');
        void expect(el?.dataset['wh40kSystem']).toBe('im');
    },
};
