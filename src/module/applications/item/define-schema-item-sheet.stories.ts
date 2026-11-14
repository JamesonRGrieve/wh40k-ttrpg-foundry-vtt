/**
 * Stories for the schema item sheets (#731): backpack, navigator power, oath,
 * order, ritual, ship role, vehicle trait and vehicle upgrade.
 *
 * Each renders the shared `item-schema-sheet.hbs` from the type's real layout,
 * through the real row builder, against a story schema whose nodes stand in for
 * the DataFields (Storybook's `formInput` draws a named text input). The `play`
 * edits the type's first field and asserts the form submits it under its
 * `system.` path, then renders the sheet under every game line.
 */
import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import templateSrc from '../../../../src/templates/item/item-schema-sheet.hbs?raw';
import type { SystemId } from '../../../../stories/mocks/extended';
import { inForm, mockSchemaSections, playSchemaFields } from '../../../../stories/mocks/schema-sections';
import { renderSheet } from '../../../../stories/test-helpers';
import type { FormObject } from './reference-list-edits.ts';
import type { SchemaSheetLayout } from './schema-sheet-layout.ts';
import { SCHEMA_SHEET_LAYOUTS } from './schema-sheet-layouts.ts';

/** The first plain path of a layout, and a source holding a value there. */
function firstField(layout: SchemaSheetLayout): string {
    const path = layout.sections.flatMap((section) => section.paths).find((entry) => !entry.includes('[]'));
    if (path === undefined) throw new Error(`${layout.type} has no plain field`);
    return path;
}

interface Args {
    layout: SchemaSheetLayout;
}

function context(layout: SchemaSheetLayout, source: FormObject = {}): object {
    return {
        item: { name: `Story ${layout.type}`, img: 'icons/svg/item-bag.svg', type: layout.type },
        system: { description: { value: '' } },
        source: {},
        editable: true,
        isEditable: true,
        inEditMode: true,
        tabGroups: { primary: 'details' },
        effects: [],
        schemaSections: mockSchemaSections(layout, source),
    };
}

/** Render the sheet inside a form, as Foundry mounts it, optionally under a game line. */
function renderInForm(layout: SchemaSheetLayout, systemId?: SystemId, source: FormObject = {}): HTMLFormElement {
    return inForm(renderSheet(templateSrc, context(layout, source)), systemId);
}

const meta = {
    title: 'Item Sheets/SchemaItemSheets',
    render: (args) => renderInForm(args.layout),
    args: { layout: SCHEMA_SHEET_LAYOUTS[0] },
} satisfies Meta<Args>;
export default meta;

type Story = StoryObj<Args>;

/** One story per layout: edit its first field, assert the submitted path, then render it under every line. */
function storyFor(layout: SchemaSheetLayout): Story {
    return {
        args: { layout },
        play: ({ canvasElement }) => {
            playSchemaFields(canvasElement, [`system.${firstField(layout)}`], (systemId) => renderInForm(layout, systemId));
        },
    };
}

function layoutFor(type: string): SchemaSheetLayout {
    const layout = SCHEMA_SHEET_LAYOUTS.find((entry) => entry.type === type);
    if (layout === undefined) throw new Error(`no layout for ${type}`);
    return layout;
}

export const Backpack: Story = storyFor(layoutFor('backpack'));
export const NavigatorPower: Story = storyFor(layoutFor('navigatorPower'));
export const Oath: Story = storyFor(layoutFor('oath'));
export const Order: Story = storyFor(layoutFor('order'));
export const Ritual: Story = storyFor(layoutFor('ritual'));
export const ShipRole: Story = storyFor(layoutFor('shipRole'));
export const VehicleTrait: Story = storyFor(layoutFor('vehicleTrait'));
export const VehicleUpgrade: Story = storyFor(layoutFor('vehicleUpgrade'));

/** A list field renders an Add button, and an entry its inputs plus a remove button. */
export const ListEditing: Story = {
    args: { layout: layoutFor('shipRole') },
    render: (args) => renderInForm(args.layout, undefined, { careerPreferences: ['Seneschal'], abilities: [{ name: 'Steady Hand' }] }),
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector<HTMLInputElement>('[name="system.careerPreferences.0"]')?.value).toBe('Seneschal');
        void expect(canvasElement.querySelector<HTMLInputElement>('[name="system.abilities.0.name"]')?.value).toBe('Steady Hand');
        void expect(canvasElement.querySelector('[data-action="addEntry"][data-path="system.abilities"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-action="removeEntry"][data-path="system.abilities"][data-index="0"]')).not.toBeNull();
    },
};
