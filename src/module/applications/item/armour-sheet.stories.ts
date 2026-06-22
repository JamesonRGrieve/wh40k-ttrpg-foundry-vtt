/**
 * Stories for ArmourSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockArmourSheetContext } from '../../../../stories/mocks';
import type { SystemId } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-armour-sheet.hbs?raw';

initializeStoryHandlebars();

interface Args {
    overrides?: Parameters<typeof mockArmourSheetContext>[0];
}

const meta = {
    title: 'Item Sheets/ArmourSheet',
    render: (args: Args) => renderSheet(templateSrc, mockArmourSheetContext(args.overrides)),
    args: {},
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/**
 * Render the armour sheet under a specific game-line theme ancestor.
 *
 * The sheet's type badge, slot icons, tab strip, and property rows all carry
 * per-system Tailwind tints (`bc:tw-text-crimson-light`, `dh2:tw-text-gold-raw`,
 * `rt:tw-text-gold`, `im:tw-text-failure`, …) that only fire when an ancestor
 * carries `data-wh40k-system="<id>"`. `renderSheet`'s wrapper defaults to `dh2`,
 * so stamping each system id surfaces the other six game lines.
 */
function renderArmourForSystem(args: Args, systemId: SystemId): HTMLElement {
    const el = renderSheet(templateSrc, mockArmourSheetContext(args.overrides));
    el.dataset['wh40kSystem'] = systemId;
    return el;
}

export const Default: Story = {};

export const Unequipped: Story = {
    args: {
        overrides: {
            isOwnedByActor: false,
            canEdit: false,
            item: { system: { state: { equipped: false } } },
            system: { state: { equipped: false } },
        },
    },
};

export const EditMode: Story = {
    args: {
        overrides: { inEditMode: true },
    },
};

export const RendersArmourName: Story = {
    play: ({ canvasElement }) => {
        const storyCanvas = within(canvasElement);
        void expect(storyCanvas.getByDisplayValue('Carapace Armour')).toBeTruthy();
    },
};

export const RendersEditModeToggle: Story = {
    args: {
        overrides: { canEdit: true },
    },
    play: ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleEditMode"]');
        void expect(btn).toBeTruthy();
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};

// ── Per-system homologation (all 7 game lines) ──────────────────────────────
//
// One story per game line so DH2-only theming assumptions surface across the
// armour sheet's badge / slot-icon / tab / property-row tints. Each renders the
// same armour context under a different `data-wh40k-system` ancestor.

/** Build a per-system homologation story for one game line. */
function systemStory(systemId: SystemId): Story {
    return {
        render: (args) => renderArmourForSystem(args, systemId),
        play: ({ canvasElement }) => {
            const storyCanvas = within(canvasElement);
            void expect(storyCanvas.getByDisplayValue('Carapace Armour')).toBeTruthy();
            // The per-system theme ancestor is stamped, so the variant tints fire.
            const root = canvasElement.querySelector<HTMLElement>('[data-wh40k-system]');
            void expect(root?.dataset['wh40kSystem']).toBe(systemId);
        },
    };
}

export const HomologationDH2: Story = systemStory('dh2');
export const HomologationDH1: Story = systemStory('dh1');
export const HomologationRT: Story = systemStory('rt');
export const HomologationBC: Story = systemStory('bc');
export const HomologationOW: Story = systemStory('ow');
export const HomologationDW: Story = systemStory('dw');
export const HomologationIM: Story = systemStory('im');
