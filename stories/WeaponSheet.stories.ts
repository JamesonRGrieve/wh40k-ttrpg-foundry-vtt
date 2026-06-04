import type { Meta, StoryObj } from '@storybook/html-vite';
import weaponSheetSrc from '../src/templates/item/item-weapon-sheet.hbs?raw';
import { mockWeaponSheetContext } from './mocks';
import { renderSheet } from './test-helpers';

const meta: Meta = {
    title: 'Item Sheets/Weapon Sheet',
};

export default meta;

type Story = StoryObj;

export const Standard: Story = {
    render: () => renderSheet(weaponSheetSrc, mockWeaponSheetContext()),
};

export const CollapsedBody: Story = {
    render: () =>
        renderSheet(
            weaponSheetSrc,
            mockWeaponSheetContext({
                bodyCollapsed: true,
            }),
        ),
};

export const EditModeNoAmmoLoaded: Story = {
    render: () =>
        renderSheet(
            weaponSheetSrc,
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
