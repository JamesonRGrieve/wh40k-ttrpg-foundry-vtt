import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { WEAPON_EXTRA_LAYOUT } from '../src/module/applications/item/schema-sheet-layouts';
import weaponSheetSrc from '../src/templates/item/item-weapon-sheet.hbs?raw';
import { mockWeaponSheetContext } from './mocks';
import type { SystemId } from './mocks/extended';
import { inForm, mockSchemaSections, playSchemaFields } from './mocks/schema-sections';
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

/** The weapon sheet with the fields its template lacks, rendered through the shared schema rows (#732). */
function renderWithSchemaFields(systemId?: SystemId): HTMLFormElement {
    const context = { ...mockWeaponSheetContext(), inEditMode: true, editable: true, schemaSections: mockSchemaSections(WEAPON_EXTRA_LAYOUT) };
    return inForm(renderSheet(weaponSheetSrc, context), systemId);
}

/** Edit mode: attack, mounting and per-place availability fields submit under their `system.` paths on every line (#732). */
export const SchemaFields: Story = {
    render: () => renderWithSchemaFields(),
    play: ({ canvasElement }) => {
        playSchemaFields(
            canvasElement,
            ['system.attack.type', 'system.attack.characteristic', 'system.secondaryClass', 'system.mounting', 'system.availabilityRestriction'],
            renderWithSchemaFields,
        );
    },
};
