import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-gear-sheet.hbs?raw';
import activeEffectsPanelSrc from '../../../../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockGearSheetContext } from '../../../../stories/mocks';
import type { SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { activateTab, detailSectionTitles, renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();
Hbs.registerPartial('systems/wh40k-rpg/templates/item/panel/active-effects-panel.hbs', activeEffectsPanelSrc);

interface Args {
    overrides?: Parameters<typeof mockGearSheetContext>[0];
}

/**
 * Render the gear sheet and stamp `data-wh40k-system` so the header's
 * per-system variant chains (`<id>:tw-text-*` on Classification) cascade —
 * `renderSheet` defaults the attribute
 * to `dh2`, so per-system stories re-stamp it (CLAUDE.md "Adaptation procedure 3a").
 */
function renderGearForSystem(systemId: SystemId, overrides?: Args['overrides']): HTMLElement {
    const el = renderSheet(templateSrc, mockGearSheetContext(overrides));
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

const meta = {
    title: 'Item Sheets/GearSheet',
    render: (args) => renderSheet(templateSrc, mockGearSheetContext(args.overrides)),
    args: {},
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** Every strip tab, Effects included, has a `.tab` panel, inside a `.tabs` nav Foundry and the sheet both bind. */
export const Default: Story = {
    play: async ({ canvasElement }) => {
        const nav = canvasElement.querySelector('nav[data-group="primary"]');
        await expect(nav?.classList.contains('tabs')).toBe(true);
        await expect(nav?.classList.contains('wh40k-tabs')).toBe(true);
        const listed = [...(nav?.querySelectorAll<HTMLElement>('[data-tab]') ?? [])].map((b) => b.dataset['tab']);
        await expect(listed).toContain('effects');
        const panels = new Set([...canvasElement.querySelectorAll<HTMLElement>('.tab[data-group="primary"]')].map((p) => p.dataset['tab']));
        await expect(listed.filter((tab) => !panels.has(tab))).toEqual([]);
    },
};

export const UsesExhausted: Story = {
    args: {
        overrides: {
            usesExhausted: true,
            usesPercentage: 0,
            system: { uses: 0 },
        },
    },
};

export const RendersName: Story = {
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        void expect(cv.getByDisplayValue('Medi-Kit')).toBeTruthy();
    },
};

/**
 * The Description tab, composed (#686): every section is a titled panel from the
 * shared item-detail-section partial, as on the armour sheet. It used bare `<h3>`s
 * that Foundry drew as large plain headings, over a raw textarea.
 */
export const DescriptionTab: Story = {
    render: (args) => activateTab(renderSheet(templateSrc, mockGearSheetContext(args.overrides)), 'description'),
    play: async ({ canvasElement }) => {
        const sections = detailSectionTitles(canvasElement, 'description');
        await expect(sections.map((s) => s.key)).toEqual([
            'WH40K.ItemSheet.Gear.MechanicalEffect',
            'WH40K.Tabs.Description',
            'WH40K.ItemSheet.Common.GmNotes',
            'WH40K.Common.Source',
        ]);
        // Each title renders, localized.
        await expect(sections.every((s) => s.title !== '' && !s.title.startsWith('WH40K.'))).toBe(true);
        await expect(canvasElement.querySelector('.tab[data-tab="description"] h3:not([data-item-section] h3)')).toBeNull();
    },
};

/**
 * #699: a gear item with no price shows "—" for its cost, never a bare "₮", and the
 * Total Weight field reads the prepared total. In the live sheet `source` is the
 * stored data, which has no `effectiveTotalWeight` getter, so the field printed a
 * bare "kg"; this story's source leaves the getter out the same way.
 */
export const NoPriceAndTotalWeight: Story = {
    render: () => {
        const ctx = mockGearSheetContext();
        const system = ctx['system'];
        const priced = typeof system === 'object' && system !== null ? system : {};
        ctx['system'] = { ...priced, cost: { dh2: { homebrew: { throneGelt: null } } } };
        ctx['source'] = { ...priced, cost: { dh2: { homebrew: { throneGelt: null } } }, effectiveTotalWeight: undefined };
        return activateTab(renderSheet(templateSrc, ctx), 'overview');
    },
    play: async ({ canvasElement }) => {
        await expect(canvasElement.querySelector('[data-field="gear-header-cost"]')?.textContent.trim()).toBe('—');
        await expect(canvasElement.querySelector<HTMLInputElement>('[data-field="gear-total-weight"]')?.value).toBe('3.5 kg');
    },
};

/**
 * The Overview tab, composed (#695): Classification, Storage, Physical Properties and
 * Economic are titled panels, not Foundry's large bare `<h3>`s, and each Storage
 * option is one labelled checkbox. A decorative square icon used to sit beside each
 * real checkbox, so every option showed two boxes.
 */
export const OverviewTab: Story = {
    render: (args) => activateTab(renderSheet(templateSrc, mockGearSheetContext(args.overrides)), 'overview'),
    play: async ({ canvasElement }) => {
        const keys = detailSectionTitles(canvasElement, 'overview').map((s) => s.key);
        await expect(keys).toEqual(
            expect.arrayContaining([
                'WH40K.ItemSheet.Gear.Classification',
                'WH40K.ItemSheet.Gear.Storage',
                'WH40K.Ammunition.PhysicalProperties',
                'WH40K.ItemSheet.Gear.Economic',
            ]),
        );
        await expect(canvasElement.querySelector('.tab[data-tab="overview"] h3:not([data-item-section] h3)')).toBeNull();

        const options = [...canvasElement.querySelectorAll<HTMLLabelElement>('[data-gear-storage] label')];
        await expect(options.length).toBeGreaterThanOrEqual(2);
        const perOption = options.map((option) => ({
            checkboxes: option.querySelectorAll('input[type="checkbox"]').length,
            squares: option.querySelectorAll('.fa-square, .fa-check-square, .fa-square-check').length,
            labelled: option.textContent.trim() !== '',
        }));
        await expect(perOption.every((o) => o.checkboxes === 1 && o.squares === 0 && o.labelled)).toBe(true);
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// The header Classification heading carries per-system Tailwind variant chains. Re-stamp `data-wh40k-system` per game line so all
// seven palettes render and a "works in DH2 but not the other six" regression
// surfaces in visual review.

export const HomologationDH2: Story = { render: () => renderGearForSystem('dh2') };
export const HomologationDH1: Story = { render: () => renderGearForSystem('dh1') };
export const HomologationRT: Story = { render: () => renderGearForSystem('rt') };
export const HomologationBC: Story = { render: () => renderGearForSystem('bc') };
export const HomologationOW: Story = { render: () => renderGearForSystem('ow') };
export const HomologationDW: Story = { render: () => renderGearForSystem('dw') };
export const HomologationIM: Story = {
    render: () => renderGearForSystem('im'),
    play: ({ canvasElement }) => {
        const cv = within(canvasElement);
        // The sheet still renders its core fields under the IM palette.
        void expect(cv.getByDisplayValue('Medi-Kit')).toBeTruthy();
    },
};
