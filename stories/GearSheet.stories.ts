import type { Meta, StoryObj } from '@storybook/html-vite';
import { GEAR_EXTRA_LAYOUT } from '../src/module/applications/item/schema-sheet-layouts';
import gearSheetSrc from '../src/templates/item/item-gear-sheet.hbs?raw';
import { mockGearSheetContext } from './mocks';
import type { SystemId } from './mocks/extended';
import { inForm, mockSchemaSections, playSchemaFields } from './mocks/schema-sections';
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

/** The gear sheet with the fields its template lacks, rendered through the shared schema rows (#732). */
function renderWithSchemaFields(systemId?: SystemId): HTMLFormElement {
    const context = { ...mockGearSheetContext(), inEditMode: true, editable: true, schemaSections: mockSchemaSections(GEAR_EXTRA_LAYOUT) };
    return inForm(renderSheet(gearSheetSrc, context), systemId);
}

/** Edit mode: addictive and per-place availability submit under their `system.` paths on every line (#732). */
export const SchemaFields: Story = {
    render: () => renderWithSchemaFields(),
    play: ({ canvasElement }) => {
        playSchemaFields(canvasElement, ['system.addictive', 'system.availabilityRestriction'], renderWithSchemaFields);
    },
};
