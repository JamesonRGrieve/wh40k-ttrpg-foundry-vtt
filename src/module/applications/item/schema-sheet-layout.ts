/**
 * Schema item sheets (#731): a per-type layout of field paths, turned into the
 * rows the shared `item-schema-sheet.hbs` template renders.
 *
 * A layout lists leaf paths into the item's `system` schema, grouped into
 * sections. `name[]` is an array of scalars (one input per entry);
 * `name[].sub` is a field of each entry in an array of objects. Every path's
 * label is the langpack key `<labelPrefix>.FIELDS.<path>.label` (with `[]`
 * dropped), Foundry's own field-label convention, so a test can check that
 * each one exists.
 *
 * Pure: it walks a schema through the structural {@link SchemaNode} shape and
 * never touches the `foundry` global, so it is testable without an Application.
 */
import { type FormValue, isFormObject } from './reference-list-edits.ts';

/** One section of a schema sheet's details tab. */
export interface SchemaSheetSection {
    /** Section key; its heading is `<labelPrefix>.Sections.<key>`. */
    readonly key: string;
    /** Font Awesome icon class for the heading (`fa-bolt`). */
    readonly icon: string;
    /** Leaf paths into `system`, in display order. */
    readonly paths: readonly string[];
    /** Label prefix for a section shared by several types; defaults to the layout's. */
    readonly labelPrefix?: string;
    /**
     * Choice fields whose option labels already live in the langpack, by path:
     * the namespace a value's label sits under (`'activation.type': 'WH40K.ActionType'`
     * labels `half-action` as `WH40K.ActionType.HalfAction`). Any other choice field's
     * options are labelled under `<prefix>.FIELDS.<path>.choices`.
     */
    readonly choiceLabels?: Readonly<Record<string, string>>;
}

/** The layout of one item type's schema sheet. */
export interface SchemaSheetLayout {
    /** The item type the sheet is registered for. */
    readonly type: string;
    /** Langpack prefix for section headings and field labels (`WH40K.ItemFields.Oath`). */
    readonly labelPrefix: string;
    readonly sections: readonly SchemaSheetSection[];
}

/**
 * The parts of a Foundry DataField the row builder reads. A SchemaField has
 * `fields`; an ArrayField or SetField has `element`. Foundry's SetField renders
 * its own multi-select, so it is an input, not a list.
 */
export interface SchemaNode {
    readonly fields?: Readonly<Record<string, SchemaNode>>;
    readonly element?: SchemaNode;
    /** Foundry's DataField#getInitialValue: the value a new array entry starts at. */
    getInitialValue?: (data: object) => FormValue;
    /** The field class; an `HTMLField` renders through the rich-text editor. */
    readonly constructor: { readonly name: string };
    /** A choice field's allowed values (Foundry also accepts a function returning them). */
    readonly choices?: readonly string[] | (() => readonly string[]);
}

/** A single input: the template renders it with `{{formInput field name=… value=…}}`. */
export interface SchemaInputRow {
    readonly kind: 'input';
    /** Form name, `system.<path>` with array indices (`system.abilities.2.name`). */
    readonly name: string;
    readonly labelKey: string;
    readonly field: SchemaNode;
    readonly value: FormValue;
    /** Rich text: the template uses the `{{editor}}` helper, as every item sheet does for HTML fields. */
    readonly html: boolean;
    /** A choice field's options, value → label key, for `{{formInput … choices= localize=true}}`. */
    readonly choices: Readonly<Record<string, string>> | null;
}

/** One entry of a list row: its inputs, and its index for the remove button. */
interface SchemaListEntry {
    readonly index: number;
    readonly rows: readonly SchemaInputRow[];
}

/** An array field: one entry per stored element, plus add / remove controls. */
export interface SchemaListRow {
    readonly kind: 'list';
    /** The array's `system.` path, which the add / remove actions update. */
    readonly name: string;
    readonly labelKey: string;
    readonly entries: readonly SchemaListEntry[];
}

/** One key of a map row: a number input for the value stored under that key. */
interface SchemaMapEntry {
    readonly name: string;
    /** The key's display label when the sheet resolves it (a skill's catalog name); else null. */
    readonly label: string | null;
    /** The key's langpack label, used when `label` is null. */
    readonly labelKey: string;
    readonly value: FormValue;
}

/**
 * A keyed map of numbers (an ObjectField such as an NPC's per-characteristic
 * overrides), one input per key of another stored object: `map{keySource}`.
 */
interface SchemaMapRow {
    readonly kind: 'map';
    readonly labelKey: string;
    readonly entries: readonly SchemaMapEntry[];
}

/** Resolves a map key's display label (`(mapPath, key) => label`), or null to use the langpack key. */
export type SchemaMapLabel = (mapPath: string, key: string) => string | null;

export type SchemaRow = SchemaInputRow | SchemaListRow | SchemaMapRow;

function prefixOf(layout: SchemaSheetLayout, section: SchemaSheetSection): string {
    return section.labelPrefix ?? layout.labelPrefix;
}

/** The heading key for a section. */
function sectionLabelKey(layout: SchemaSheetLayout, section: SchemaSheetSection): string {
    return `${prefixOf(layout, section)}.Sections.${section.key}`;
}

/** The label key for a section's path (`importantSkills[].name` → `….FIELDS.importantSkills.name.label`). */
function fieldLabelKey(layout: SchemaSheetLayout, section: SchemaSheetSection, path: string): string {
    return `${prefixOf(layout, section)}.FIELDS.${path.replaceAll('[]', '').replace(/\{[^}]*\}$/, '')}.label`;
}

/** The label key for one option of a choice field; the blank option is "None". */
export function choiceLabelKey(layout: SchemaSheetLayout, section: SchemaSheetSection, path: string, value: string): string {
    if (value === '') return 'WH40K.Common.None';
    const clean = path.replaceAll('[]', '');
    const namespace = section.choiceLabels?.[clean] ?? `${prefixOf(layout, section)}.FIELDS.${clean}.choices`;
    const pascal = value
        .split(/[-_]/)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
    return `${namespace}.${pascal}`;
}

/** A choice field's allowed values, or [] for a field without choices. */
export function choiceValues(node: SchemaNode): readonly string[] {
    const { choices } = node;
    if (choices === undefined) return [];
    return typeof choices === 'function' ? choices() : choices;
}

function choiceMap(layout: SchemaSheetLayout, section: SchemaSheetSection, path: string, node: SchemaNode): Readonly<Record<string, string>> | null {
    const values = choiceValues(node);
    if (values.length === 0) return null;
    return Object.fromEntries(values.map((value) => [value, choiceLabelKey(layout, section, path, value)]));
}

/** Every label key a layout uses: its section headings, its fields and its lists. */
export function layoutLabelKeys(layout: SchemaSheetLayout): string[] {
    const keys = new Set<string>();
    for (const section of layout.sections) {
        keys.add(sectionLabelKey(layout, section));
        for (const path of section.paths) {
            keys.add(fieldLabelKey(layout, section, path));
            if (path.includes('{')) continue;
            const list = path.indexOf('[]');
            if (list >= 0) keys.add(fieldLabelKey(layout, section, path.slice(0, list)));
        }
    }
    return [...keys].sort();
}

/** The schema node at a dotted path, or undefined. */
export function schemaNodeAt(root: SchemaNode, path: string): SchemaNode | undefined {
    let node: SchemaNode = root;
    for (const key of path.split('.')) {
        const child = node.fields?.[key];
        if (child === undefined) return undefined;
        node = child;
    }
    return node;
}

function valueAt(source: FormValue, path: string): FormValue {
    let value: FormValue = source;
    for (const key of path.split('.')) {
        if (!isFormObject(value)) return undefined;
        value = value[key];
    }
    return value;
}

function isHtml(node: SchemaNode): boolean {
    return node.constructor.name === 'HTMLField';
}

function asEntries(value: FormValue): readonly FormValue[] {
    return Array.isArray(value) ? value : [];
}

/**
 * The rows for one section, in layout order. Consecutive `list[]…` paths of the
 * same array become one list row whose entries hold an input per sub-path.
 * A path the schema does not have is skipped, so a layout shared across lines
 * shows only the fields the item's own schema stores.
 */
export function buildSectionRows(
    layout: SchemaSheetLayout,
    section: SchemaSheetSection,
    schema: SchemaNode,
    source: FormValue,
    mapLabel: SchemaMapLabel = () => null,
): SchemaRow[] {
    const rows: SchemaRow[] = [];
    const lists = new Map<string, string[]>();
    const order: Array<{ kind: 'input' | 'list'; path: string } | { kind: 'map'; path: string; keySource: string }> = [];
    for (const path of section.paths) {
        const brace = path.indexOf('{');
        if (brace > 0 && path.endsWith('}')) {
            order.push({ kind: 'map', path: path.slice(0, brace), keySource: path.slice(brace + 1, -1) });
            continue;
        }
        const marker = path.indexOf('[]');
        if (marker < 0) {
            order.push({ kind: 'input', path });
            continue;
        }
        const listPath = path.slice(0, marker);
        const sub = path.slice(marker + 2).replace(/^\./, '');
        const subs = lists.get(listPath);
        if (subs === undefined) {
            lists.set(listPath, [sub]);
            order.push({ kind: 'list', path: listPath });
        } else subs.push(sub);
    }
    for (const item of order) {
        const node = schemaNodeAt(schema, item.path);
        if (node === undefined) continue;
        if (item.kind === 'map') {
            const keySource = valueAt(source, item.keySource);
            const keys = isFormObject(keySource) ? Object.keys(keySource) : [];
            rows.push({
                kind: 'map',
                labelKey: fieldLabelKey(layout, section, item.path),
                entries: keys.map((key) => ({
                    name: `system.${item.path}.${key}`,
                    label: mapLabel(item.path, key),
                    labelKey: choiceLabelKey(layout, section, item.path, key),
                    value: valueAt(source, `${item.path}.${key}`),
                })),
            });
            continue;
        }
        if (item.kind === 'input') {
            rows.push({
                kind: 'input',
                name: `system.${item.path}`,
                labelKey: fieldLabelKey(layout, section, item.path),
                field: node,
                value: valueAt(source, item.path),
                html: isHtml(node),
                choices: choiceMap(layout, section, item.path, node),
            });
            continue;
        }
        const element = node.element;
        if (element === undefined) continue;
        const subs = lists.get(item.path) ?? [''];
        const entries = asEntries(valueAt(source, item.path)).map((entry, index) => ({
            index,
            rows: subs.flatMap((sub): SchemaInputRow[] => {
                const field = sub === '' ? element : schemaNodeAt(element, sub);
                if (field === undefined) return [];
                const suffix = sub === '' ? '' : `.${sub}`;
                return [
                    {
                        kind: 'input',
                        name: `system.${item.path}.${index}${suffix}`,
                        labelKey: fieldLabelKey(layout, section, `${item.path}${suffix}`),
                        field,
                        value: sub === '' ? entry : valueAt(entry, sub),
                        html: isHtml(field),
                        choices: choiceMap(layout, section, `${item.path}${suffix}`, field),
                    },
                ];
            }),
        }));
        rows.push({ kind: 'list', name: `system.${item.path}`, labelKey: fieldLabelKey(layout, section, item.path), entries });
    }
    return rows;
}

/** One section of a schema sheet, ready for `templates/item/partial/schema-sections.hbs`. */
export interface SchemaSectionView {
    readonly labelKey: string;
    readonly icon: string;
    readonly rows: readonly SchemaRow[];
}

/** Every section of a layout as rows against the item's schema and stored source. */
export function buildSchemaSections(layout: SchemaSheetLayout, schema: SchemaNode, source: FormValue, mapLabel?: SchemaMapLabel): SchemaSectionView[] {
    return layout.sections.map((section) => ({
        labelKey: sectionLabelKey(layout, section),
        icon: section.icon,
        rows: buildSectionRows(layout, section, schema, source, mapLabel),
    }));
}
