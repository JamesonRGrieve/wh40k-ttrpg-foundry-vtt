import type { Meta, StoryObj } from '@storybook/html-vite';
import gearSheetSrc from '../src/templates/item/item-gear-sheet.hbs?raw';
import { mockGearSheetContext } from './mocks';
import { renderSheet } from './test-helpers';

const meta: Meta = {
    title: 'Item Sheets/Gear Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderSheet(gearSheetSrc, mockGearSheetContext()),
};

export const UsesExhausted: Story = {
    render: () =>
        renderSheet(
            gearSheetSrc,
            mockGearSheetContext({
                usesExhausted: true,
                usesPercentage: 0,
                system: {
                    uses: 0,
                },
            }),
        ),
};

export const HiddenCostReadOnly: Story = {
    render: () =>
        renderSheet(
            gearSheetSrc,
            mockGearSheetContext({
                hasLimitedUses: false,
                hideThroneGelt: true,
                system: {
                    consumable: false,
                    quantity: 1,
                },
            }),
        ),
};
