/**
 * Stories for PsychicPowerSheet (defineSimpleItemSheet variant).
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockItem, mockSourceReference } from '../../../../stories/mocks';
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
            source: mockSourceReference(),
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

// ── Source reference (#229) ─────────────────────────────────────────────────
//
// `system.source` is the structured provenance object. The Power Details grid
// used to bind an input straight to it and showed "[object Object]"; it now
// edits Book + Page and the header badge formats through `sourceLabel`.

export const SourceReferenceEditable: Story = {
    render: () => renderSheet(templateSrc, makeCtx()),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByText('Dark Heresy 2e Core, p.198')).toBeTruthy();
        const book = canvasElement.querySelector<HTMLInputElement>('input[name="system.source.book"]');
        const page = canvasElement.querySelector<HTMLInputElement>('input[name="system.source.page"]');
        void expect(book?.value).toBe('Dark Heresy 2e Core');
        void expect(page?.value).toBe('198');
        void expect(canvasElement.querySelector('input[name="system.source"]')).toBeNull();
        void expect(canvasElement.innerHTML).not.toContain('[object Object]');
    },
};

export const SourceReferenceReadOnly: Story = {
    render: () => renderSheet(templateSrc, makeCtx({ editable: false })),
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getAllByText('Dark Heresy 2e Core, p.198')).toHaveLength(2);
        void expect(canvasElement.querySelector('input[name="system.source.book"]')).toBeNull();
        void expect(canvasElement.innerHTML).not.toContain('[object Object]');
    },
};

/**
 * The damage field edits the damage profile's formula. It was bound to the whole
 * `system.damage` record, so it showed "[object Object]" and a save would have
 * overwritten the profile with a string.
 */
export const DamageFormulaField: Story = {
    render: () => {
        const ctx = makeCtx({ inEditMode: true });
        ctx.item.system['damage'] = { formula: '1d10+PR', type: 'energy', bonus: 0, penetration: 0, none: false, bands: [], table: '', from: '' };
        return renderSheet(templateSrc, ctx);
    },
    play: ({ canvasElement }) => {
        const input = canvasElement.querySelector<HTMLInputElement>('input[name="system.damage.formula"]');
        void expect(input?.value).toBe('1d10+PR');
        void expect(canvasElement.querySelector('input[name="system.damage"]')).toBeNull();
        void expect(canvasElement.innerHTML).not.toContain('[object Object]');
    },
};

// ── XP cost (#642) ──────────────────────────────────────────────────────────
//
// The XP Cost input binds `system.cost`, which the schema now carries (the
// book's "Value: N xp"); before, the field was absent and a save dropped it.

export const XpCostAuthored: Story = {
    render: () => {
        const ctx = makeCtx({ inEditMode: true });
        ctx.item.system['cost'] = 300;
        return renderSheet(templateSrc, ctx);
    },
    play: ({ canvasElement }) => {
        const input = canvasElement.querySelector<HTMLInputElement>('input[name="system.cost"]');
        void expect(input?.value).toBe('300');
        void expect(input?.min).toBe('0');
        // The header shows the printed cost as an XP badge.
        void expect(canvasElement.querySelector('.fa-gem')).not.toBeNull();
        void expect(within(canvasElement).getAllByText('300').length).toBeGreaterThan(0);
    },
};

export const XpCostNotAuthored: Story = {
    render: () => {
        const ctx = makeCtx({ inEditMode: true });
        ctx.item.system['cost'] = null;
        return renderSheet(templateSrc, ctx);
    },
    play: ({ canvasElement }) => {
        // Null means "not authored": an empty input and no header badge.
        const input = canvasElement.querySelector<HTMLInputElement>('input[name="system.cost"]');
        void expect(input?.value).toBe('');
        void expect(canvasElement.querySelector('.fa-gem')).toBeNull();
    },
};

export const SourceReferenceEmpty: Story = {
    render: () => {
        const ctx = makeCtx();
        ctx.item.system['source'] = mockSourceReference({ book: '', page: '' });
        return renderSheet(templateSrc, ctx);
    },
    play: ({ canvasElement }) => {
        // An empty reference hides the header badge instead of rendering a blank chip.
        void expect(canvasElement.querySelector('.fa-book')).toBeNull();
        void expect(canvasElement.innerHTML).not.toContain('[object Object]');
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
