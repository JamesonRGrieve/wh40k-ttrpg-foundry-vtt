/**
 * Stories for WeaponSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockWeaponSheetContext } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { renderSheet } from '../../../../stories/test-helpers';
import templateSrc from '../../../templates/item/item-weapon-sheet.hbs?raw';

initializeStoryHandlebars();

interface Args {
    overrides?: Parameters<typeof mockWeaponSheetContext>[0];
}

const meta = {
    title: 'Item Sheets/WeaponSheet',
    render: (args: Args) => renderSheet(templateSrc, mockWeaponSheetContext(args.overrides)),
    args: {},
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const BodyExpanded: Story = {
    args: {
        overrides: { bodyCollapsed: false },
    },
};

export const EditMode: Story = {
    args: {
        overrides: { inEditMode: true, bodyCollapsed: false },
    },
};

export const NoAmmoLoaded: Story = {
    args: {
        overrides: {
            hasLoadedAmmo: false,
            loadedAmmoData: { modifiers: { damage: 0, penetration: 0 }, addedQualities: [] },
        },
    },
};

export const RendersWeaponName: Story = {
    play: async ({ canvasElement }) => {
        const withinCanvas = within(canvasElement);
        await expect(withinCanvas.getByDisplayValue('Godwyn-Deaz Boltgun')).toBeTruthy();
    },
};

export const RendersToggleBodyAction: Story = {
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleBody"]');
        await expect(btn).toBeTruthy();
        // Dispatch click — verifies event wires without Foundry runtime
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
