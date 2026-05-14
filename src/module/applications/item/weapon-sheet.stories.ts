/**
 * Stories for WeaponSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-weapon-sheet.hbs?raw';
import { mockWeaponSheetContext, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);

interface Args {
    overrides?: Parameters<typeof mockWeaponSheetContext>[0];
}

const meta = {
    title: 'Item Sheets/WeaponSheet',
    render: (args: Args) => renderTemplate(compiled, mockWeaponSheetContext(args.overrides)),
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
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Godwyn-Deaz Boltgun')).toBeTruthy();
    },
};

export const RendersToggleBodyAction: Story = {
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleBody"]');
        expect(btn).toBeTruthy();
        // Dispatch click — verifies event wires without Foundry runtime
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
