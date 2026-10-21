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
import { PSYCHIC_DISCIPLINE_CHOICES, psychicDisciplineOptions } from '../../data/item/psychic-discipline';

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
            discipline: 'biomancy',
            // The DataModel getters the template reads (#659), as they resolve for 'biomancy'.
            disciplineLabel: 'Biomancy',
            disciplineOptions: psychicDisciplineOptions('biomancy'),
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
        // Null means "not authored" (per-power costs await content#30): the input
        // says "Not set" and the header badge reads "—" rather than vanishing (#659).
        const input = canvasElement.querySelector<HTMLInputElement>('input[name="system.cost"]');
        void expect(input?.value).toBe('');
        void expect(input?.placeholder).toBe('Not set');
        void expect(canvasElement.querySelector('[data-field="xp-cost"]')?.textContent.trim()).toBe('—');
    },
};

/** The sheet's default width (PsychicPowerSheet `width`). */
const SHEET_WIDTH_PX = 550;

/**
 * #659: the discipline showed its raw key ("pyromancy") as a free-text input, and the
 * header's stat block fell into the 80px image column, so "PYROMANCY POWER", the
 * source and the range wrapped word by word. The discipline is now a select over the
 * disciplines with langpack labels, and the block spans the header.
 */
export const DisciplineSelectAndHeaderWidth: Story = {
    render: () => {
        const ctx = makeCtx({ inEditMode: true });
        ctx.item.system['range'] = '15 metres x Psy Rating';
        const sheet = renderSheet(templateSrc, ctx);
        sheet.style.width = `${SHEET_WIDTH_PX}px`;
        return sheet;
    },
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.discipline"]');
        await expect(Array.from(select?.options ?? [], (option) => option.value)).toEqual([...PSYCHIC_DISCIPLINE_CHOICES]);
        await expect(select?.value).toBe('biomancy');
        await expect(select?.selectedOptions[0]?.textContent.trim()).toBe('Biomancy');
        await expect(canvasElement.querySelector('[data-field="discipline-label"]')?.textContent.trim()).toBe('Biomancy Power');
        const slot = canvasElement.querySelector('[data-field="item-header-slot"]');
        await expect(slot?.getBoundingClientRect().width ?? 0).toBeGreaterThan(SHEET_WIDTH_PX / 2);
    },
};

/**
 * content#35: a power keeps the discipline its book prints ("Nurgle", BC core p. 212). The
 * select lists it first and selected, so saving the sheet never overwrites it with a
 * tree name, and the header shows it as printed.
 */
export const PrintedDisciplineKept: Story = {
    render: () => {
        const ctx = makeCtx({ inEditMode: true });
        ctx.item.system['discipline'] = 'Nurgle';
        ctx.item.system['disciplineLabel'] = 'Nurgle';
        ctx.item.system['disciplineOptions'] = psychicDisciplineOptions('Nurgle');
        return renderSheet(templateSrc, ctx);
    },
    play: async ({ canvasElement }) => {
        const select = canvasElement.querySelector<HTMLSelectElement>('select[name="system.discipline"]');
        await expect(select?.value).toBe('Nurgle');
        await expect(select?.options[0]?.textContent.trim()).toBe('Nurgle');
        await expect(Array.from(select?.options ?? [], (option) => option.value).slice(1)).toEqual([...PSYCHIC_DISCIPLINE_CHOICES]);
        await expect(canvasElement.querySelector('[data-field="discipline-label"]')?.textContent.trim()).toBe('Nurgle Power');
    },
};

/**
 * #696: the Attack Specials panel had an "Add Special" button with no `data-action`,
 * so clicking it did nothing. The sheet has no add-special action, so the button is
 * gone, and every other button the sheet renders, in edit mode too, names an action
 * or a tab.
 */
export const AttackSpecialsNoDeadButton: Story = {
    render: () => renderSheet(templateSrc, makeCtx({ inEditMode: true })),
    play: async ({ canvasElement }) => {
        const panel = canvasElement.querySelector('[data-item-section="WH40K.ItemSheet.PsychicPower.AttackSpecials"]');
        await expect(panel).not.toBeNull();
        const panelButtons = [...(panel?.querySelectorAll('button') ?? [])];
        await expect(panelButtons.map((b) => b.textContent.trim())).not.toContain('Add Special');
        // Tab buttons switch through Foundry's tab handling, keyed by `data-tab`.
        const dead = [...canvasElement.querySelectorAll<HTMLButtonElement>('button:not([data-tab])')].filter(
            (b) => b.type !== 'submit' && (b.dataset['action'] ?? '') === '',
        );
        await expect(dead.map((b) => b.outerHTML.slice(0, 80))).toEqual([]);
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
