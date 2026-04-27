import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import armourSheetSrc from '../src/templates/item/item-armour-sheet.hbs?raw';
import { mockArmourSheetContext, renderTemplate } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const template = Handlebars.compile(armourSheetSrc);

const meta: Meta = {
    title: 'Item Sheets/Armour Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderTemplate(template, mockArmourSheetContext()),
};

export const StowedReadOnly: Story = {
    render: () =>
        renderTemplate(
            template,
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
        renderTemplate(
            template,
            mockArmourSheetContext({
                inEditMode: true,
            }),
        ),
};
