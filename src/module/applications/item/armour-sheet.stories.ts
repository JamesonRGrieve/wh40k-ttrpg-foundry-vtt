/**
 * Stories for ArmourSheet.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, within } from 'storybook/test';
import { mockArmourSheetContext } from '../../../../stories/mocks';
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
