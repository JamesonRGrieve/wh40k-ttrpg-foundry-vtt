/**
 * @file defineSchemaItemSheet — an item sheet rendered from a schema layout (#731).
 *
 * The details tab lists the layout's sections; each field renders through
 * Foundry's `{{formInput}}` from the item's own schema field, so the input
 * matches the stored type (text, number, checkbox, select from `choices`, rich
 * text). Arrays render one row per entry with add / remove controls. The
 * description and Active Effects tabs are the shared panels every item sheet uses.
 */
import type BaseItemSheet from './base-item-sheet.ts';
import defineSimpleItemSheet from './define-simple-item-sheet.ts';
import { isFormValue } from './reference-list-edits.ts';
import { removeEntryAction, updateSystemPath } from './reference-list-item-sheet.ts';
import { buildSectionRows, schemaNodeAt, sectionLabelKey, type SchemaNode, type SchemaSheetLayout } from './schema-sheet-layout.ts';

/** The template every schema sheet renders. */
const SCHEMA_SHEET_TEMPLATE = 'systems/wh40k-rpg/templates/item/item-schema-sheet.hbs';

/** The schema of the sheet's item, read through the structural shape the row builder walks. */
function itemSchema(sheet: BaseItemSheet): SchemaNode {
    return sheet.item.system.schema;
}

/** Append one entry, at the element field's initial value, to the array the button names. */
async function addEntry(this: BaseItemSheet, _event: Event, target: HTMLElement): Promise<void> {
    const { path } = target.dataset;
    if (path === undefined || !this.inEditMode) return;
    const element = schemaNodeAt(itemSchema(this), path.replace(/^system\./, ''))?.element;
    if (element === undefined) return;
    const initial = element.getInitialValue?.({}) ?? '';
    await updateSystemPath(this, path, (current) => [...(Array.isArray(current) ? current : []), initial]);
}

/** Build the registered sheet class for one item type's layout. */
export default function defineSchemaItemSheet(layout: SchemaSheetLayout, className: string): typeof BaseItemSheet {
    return defineSimpleItemSheet({
        className,
        classes: ['wh40k-rpg', 'sheet', 'item', 'wh40k-schema-sheet'],
        template: SCHEMA_SHEET_TEMPLATE,
        width: 620,
        height: 720,
        tabs: [
            { tab: 'details', group: 'primary', label: 'WH40K.Tabs.Details' },
            { tab: 'description', group: 'primary', label: 'WH40K.Tabs.Description' },
            { tab: 'effects', group: 'primary', label: 'WH40K.Tabs.Effects' },
        ],
        defaultTab: 'details',
        actions: { addEntry, removeEntry: removeEntryAction },
        prepareContext(sheet, context) {
            const schema = itemSchema(sheet);
            const raw = context['source'];
            const source = isFormValue(raw) ? raw : undefined;
            context['schemaSections'] = layout.sections.map((section) => ({
                labelKey: sectionLabelKey(layout, section),
                icon: section.icon,
                rows: buildSectionRows(layout, section, schema, source),
            }));
        },
    });
}
