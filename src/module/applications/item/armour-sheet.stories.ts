/**
 * Stories for ArmourSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import { expect, within } from 'storybook/test';
import templateSrc from '../../../templates/item/item-armour-sheet.hbs?raw';
import { mockArmourSheetContext, renderTemplate } from '../../../../stories/mocks';
import { initializeStoryHandlebars } from '../../../../stories/template-support';

initializeStoryHandlebars();
const compiled = Handlebars.compile(templateSrc);

interface Args {
    overrides?: Parameters<typeof mockArmourSheetContext>[0];
}

const meta = {
    title: 'Item Sheets/ArmourSheet',
    render: (args: Args) => renderTemplate(compiled, mockArmourSheetContext(args.overrides)),
    args: {},
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

export const Default: Story = {};

export const Unequipped: Story = {
    args: {
        overrides: {
            isOwnedByActor: false,
            canEdit: false,
            item: { system: { equipped: false } },
            system: { equipped: false },
        },
    },
};

export const EditMode: Story = {
    args: {
        overrides: { inEditMode: true },
    },
};

export const RendersArmourName: Story = {
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        expect(canvas.getByDisplayValue('Carapace Armour')).toBeTruthy();
    },
};

export const RendersEditModeToggle: Story = {
    args: {
        overrides: { canEdit: true },
    },
    play: async ({ canvasElement }) => {
        const btn = canvasElement.querySelector('[data-action="toggleEditMode"]');
        expect(btn).toBeTruthy();
        btn?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },
};
