import type { Meta, StoryObj } from '@storybook/html-vite';
import Hbs from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-gear-sheet.hbs?raw';
import activeEffectsPanelSrc from '../../../../src/templates/item/panel/active-effects-panel.hbs?raw';
import { mockGearSheetContext } from '../../../../stories/mocks';
import type { SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';

initializeStoryHandlebars();
Hbs.registerPartial('systems/wh40k-rpg/templates/item/panel/active-effects-panel.hbs', activeEffectsPanelSrc);

interface Args {
    overrides?: Parameters<typeof mockGearSheetContext>[0];
}

/**
 * Render the gear sheet and stamp `data-wh40k-system` so the header's
 * per-system variant chains (`<id>:tw-text-*` on Classification, the
 * `dh2:`/`bc:` profane badge) cascade — `renderSheet` defaults the attribute
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

/** `crimson-light` (#b22222): the strip's old heading/label colour, ~2:1 on its maroon wash. */
const OLD_STRIP_RED = 'rgb(178, 34, 34)';

/** The resolved colour of a CSS custom property, read through a probe element. */
function tokenColour(root: HTMLElement, token: string): string {
    const probe = document.createElement('span');
    probe.style.color = `var(${token})`;
    root.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
}

/**
 * #660: the Profane Object strip's heading, aura line and hook label were red on
 * maroon, and the header chip red on red. They take the themed danger red and
 * theme text now; tests/profane-strip-contrast.test.ts measures them on both themes.
 */
export const ProfaneObjectStripReadable: Story = {
    args: {
        overrides: {
            profaneObject: {
                label: 'Eye of Tzeentch',
                aura: { radiusMetres: 10, label: 'Psychic phenomena within the aura gain +10' },
                hook: { trigger: 'Focus Power', corruptionPerTrigger: 1, insanityPerTrigger: 0 },
            },
        },
    },
    play: async ({ canvasElement }) => {
        const strip = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="gear-profane-panel"]');
        const chip = canvasElement.querySelector<HTMLElement>('[data-wh40k-hook="gear-profane-badge"]');
        await expect(strip).not.toBeNull();
        await expect(chip?.textContent).toContain('Eye of Tzeentch');
        const danger = tokenColour(canvasElement, '--wh40k-danger-text');
        const heading = strip?.firstElementChild;
        await expect(heading == null ? '' : getComputedStyle(heading).color).toBe(danger);
        await expect(chip === null ? '' : getComputedStyle(chip).color).toBe(danger);
        await expect(danger).not.toBe(OLD_STRIP_RED);
        await expect(strip === null ? '' : getComputedStyle(strip).color).toBe(tokenColour(canvasElement, '--wh40k-text-dark'));
    },
};

// ── Per-system homologation ───────────────────────────────────────────────────
//
// The header Classification heading and the profane badge carry per-system
// Tailwind variant chains. Re-stamp `data-wh40k-system` per game line so all
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
