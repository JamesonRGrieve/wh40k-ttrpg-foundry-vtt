import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import gearSheetSrc from '../src/templates/item/item-gear-sheet.hbs?raw';
import { mockGearSheetContext, renderTemplate } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const template = Handlebars.compile(gearSheetSrc);

const meta: Meta = {
    title: 'Item Sheets/Gear Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderTemplate(template, mockGearSheetContext()),
};

export const UsesExhausted: Story = {
    render: () =>
        renderTemplate(
            template,
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
        renderTemplate(
            template,
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
