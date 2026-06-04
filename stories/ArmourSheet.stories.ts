import type { Meta, StoryObj } from '@storybook/html-vite';
import armourSheetSrc from '../src/templates/item/item-armour-sheet.hbs?raw';
import { mockArmourSheetContext } from './mocks';
import { renderSheet } from './test-helpers';

const meta: Meta = {
    title: 'Item Sheets/Armour Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderSheet(armourSheetSrc, mockArmourSheetContext()),
};

export const StowedReadOnly: Story = {
    render: () =>
        renderSheet(
            armourSheetSrc,
            mockArmourSheetContext({
                isOwnedByActor: false,
                canEdit: false,
                item: {
                    system: {
                        equipped: false,
                        maxAgility: 0,
                    },
                },
                system: {
                    equipped: false,
                    maxAgility: 0,
                },
            }),
        ),
};

export const EditMode: Story = {
    render: () =>
        renderSheet(
            armourSheetSrc,
            mockArmourSheetContext({
                inEditMode: true,
            }),
        ),
};
