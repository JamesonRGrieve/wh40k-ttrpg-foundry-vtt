import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
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
    play: async ({ canvasElement }) => {
        // The edit fields show the stored weapon (they rendered empty without a `source`).
        const value = (name: string): string => canvasElement.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value ?? '';
        await expect(value('system.damage.formula')).toBe('1d10');
        await expect(value('system.damage.penetration')).toBe('4');
        await expect(value('system.clip.max')).toBe('24');
        await expect(value('system.weight')).toBe('8.5');
    },
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
