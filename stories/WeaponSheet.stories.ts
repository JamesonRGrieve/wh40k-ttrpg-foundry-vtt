import type { Meta, StoryObj } from '@storybook/html-vite';
import HandlebarsLib from 'handlebars';
import weaponSheetSrc from '../src/templates/item/item-weapon-sheet.hbs?raw';
import { mockWeaponSheetContext, renderTemplate as renderStoryTemplate } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const template = HandlebarsLib.compile(weaponSheetSrc);

const meta: Meta = {
    title: 'Item Sheets/Weapon Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderStoryTemplate(template, mockWeaponSheetContext()),
};

export const CollapsedBody: Story = {
    render: () =>
        renderStoryTemplate(
            template,
            mockWeaponSheetContext({
                bodyCollapsed: true,
            }),
        ),
};

export const EditModeNoAmmoLoaded: Story = {
    render: () =>
        renderStoryTemplate(
            template,
            mockWeaponSheetContext({
                inEditMode: true,
                hasLoadedAmmo: false,
                loadedAmmoData: {
                    modifiers: {
                        damage: 0,
                        penetration: 0,
                    },
                    addedQualities: [],
                },
            }),
        ),
};
