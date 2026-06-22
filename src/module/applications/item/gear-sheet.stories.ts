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

export const Default: Story = {};

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
