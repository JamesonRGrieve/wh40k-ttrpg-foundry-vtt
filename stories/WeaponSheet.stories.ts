import type { Meta, StoryObj } from '@storybook/html-vite';
import Handlebars from 'handlebars';
import weaponSheetSrc from '../src/templates/item/item-weapon-sheet.hbs?raw';
import { mockWeaponSheetContext, renderTemplate } from './mocks';
import { initializeStoryHandlebars } from './template-support';

initializeStoryHandlebars();

const template = Handlebars.compile(weaponSheetSrc);

const meta: Meta = {
    title: 'Item Sheets/Weapon Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderTemplate(template, mockWeaponSheetContext()),
};

export const CollapsedBody: Story = {
    render: () =>
        renderTemplate(
            template,
            mockWeaponSheetContext({
                bodyCollapsed: true,
            }),
        ),
};

export const EditModeNoAmmoLoaded: Story = {
    render: () =>
        renderTemplate(
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
