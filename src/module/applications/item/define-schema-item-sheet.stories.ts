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
import { renderSheet, submitForm } from '../../../../stories/test-helpers';
import { buildSectionRows, sectionLabelKey, type SchemaNode, type SchemaSheetLayout } from './schema-sheet-layout.ts';
import { SCHEMA_SHEET_LAYOUTS } from './schema-sheet-layouts.ts';

const SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

/** A story stand-in for a DataField of the named class. */
function node(name: string, extra: Partial<SchemaNode> = {}): SchemaNode {
    const Named = class {};
    Object.defineProperty(Named, 'name', { value: name });
    return Object.assign(Object.create(Named.prototype) as SchemaNode, extra);
}

/** Insert `leaf` at a dotted path of a story schema, creating SchemaFields on the way. */
function insert(root: Record<string, SchemaNode>, path: string, leaf: SchemaNode): void {
    const [head, ...rest] = path.split('.');
    if (rest.length === 0) {
        root[head] = leaf;
        return;
    }
    const fields: Record<string, SchemaNode> = { ...(Object.hasOwn(root, head) ? root[head].fields : {}) };
    insert(fields, rest.join('.'), leaf);
    root[head] = node('SchemaField', { fields });
}

/** A story schema with a node for every path of `layout`: strings, and arrays for `[]` paths. */
function storySchema(layout: SchemaSheetLayout): SchemaNode {
    const fields: Record<string, SchemaNode> = {};
    const elements = new Map<string, Record<string, SchemaNode>>();
    for (const path of layout.sections.flatMap((section) => section.paths)) {
        const marker = path.indexOf('[]');
        if (marker < 0) {
            insert(fields, path, node('StringField'));
            continue;
        }
        const list = path.slice(0, marker);
        const sub = path.slice(marker + 3);
        const element = elements.get(list) ?? {};
        elements.set(list, element);
        if (sub !== '') element[sub] = node('StringField');
        insert(fields, list, node('ArrayField', { element: sub === '' ? node('StringField') : node('SchemaField', { fields: element }) }));
    }
    return node('SchemaField', { fields });
}

/** The first plain path of a layout, and a source holding a value there. */
function firstField(layout: SchemaSheetLayout): string {
    const path = layout.sections.flatMap((section) => section.paths).find((entry) => !entry.includes('[]'));
    if (path === undefined) throw new Error(`${layout.type} has no plain field`);
    return path;
}

interface Args {
    layout: SchemaSheetLayout;
}

function context(layout: SchemaSheetLayout): object {
    const schema = storySchema(layout);
    return {
        item: { name: `Story ${layout.type}`, img: 'icons/svg/item-bag.svg', type: layout.type },
        system: { description: { value: '' } },
        source: {},
        editable: true,
        isEditable: true,
        inEditMode: true,
        tabGroups: { primary: 'details' },
        effects: [],
        schemaSections: layout.sections.map((section) => ({
            labelKey: sectionLabelKey(layout, section),
            icon: section.icon,
            rows: buildSectionRows(layout, section, schema, {}),
        })),
    };
}

/** Render the sheet inside a form, as Foundry mounts it, optionally under a game line. */
function renderInForm(layout: SchemaSheetLayout, systemId?: SystemId): HTMLFormElement {
    const form = document.createElement('form');
    const sheet = renderSheet(templateSrc, context(layout));
    if (systemId !== undefined) sheet.dataset['wh40kSystem'] = systemId;
    form.append(sheet);
    return form;
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
            const form = canvasElement.querySelector('form');
            void expect(form).not.toBeNull();
            if (form === null) return;
            const name = `system.${firstField(layout)}`;
            const submitted: FormData[] = [];
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                submitted.push(new FormData(form));
            });
            submitForm(form, { [name]: 'edited' });
            void expect(submitted.at(0)?.get(name)).toBe('edited');
            for (const systemId of SYSTEMS) {
                const rendered = renderInForm(layout, systemId);
                void expect(rendered.querySelector(`[data-wh40k-system="${systemId}"] [name="${name}"]`)).not.toBeNull();
            }
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
    render: (args) => {
        const layout = args.layout;
        const schema = storySchema(layout);
        const source = { careerPreferences: ['Seneschal'], abilities: [{ name: 'Steady Hand' }] };
        const form = document.createElement('form');
        form.append(
            renderSheet(templateSrc, {
                ...context(layout),
                schemaSections: layout.sections.map((section) => ({
                    labelKey: sectionLabelKey(layout, section),
                    icon: section.icon,
                    rows: buildSectionRows(layout, section, schema, source),
                })),
            }),
        );
        return form;
    },
    play: ({ canvasElement }) => {
        void expect(canvasElement.querySelector<HTMLInputElement>('[name="system.careerPreferences.0"]')?.value).toBe('Seneschal');
        void expect(canvasElement.querySelector<HTMLInputElement>('[name="system.abilities.0.name"]')?.value).toBe('Steady Hand');
        void expect(canvasElement.querySelector('[data-action="addEntry"][data-path="system.abilities"]')).not.toBeNull();
        void expect(canvasElement.querySelector('[data-action="removeEntry"][data-path="system.abilities"][data-index="0"]')).not.toBeNull();
    },
};
