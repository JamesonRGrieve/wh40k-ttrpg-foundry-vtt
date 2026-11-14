/**
 * Story support for the shared schema rows (#731, #732): a story schema with a
 * node for every path of a layout, the `schemaSections` context built from it
 * through the real row builder, and a `play` that checks the rows submit.
 *
 * Story nodes stand in for Foundry DataFields; Storybook's `formInput` draws a
 * named text input for each, so the form round-trip is what a story checks.
 */
import { expect } from 'storybook/test';
import type { FormValue } from '../../src/module/applications/item/reference-list-edits';
import { buildSchemaSections, type SchemaNode, type SchemaSectionView, type SchemaSheetLayout } from '../../src/module/applications/item/schema-sheet-layout';
import { submitForm } from '../test-helpers';
import type { SystemId } from './extended';

/** The seven lines a story renders a sheet under. */
const STORY_SYSTEMS: readonly SystemId[] = ['dh2', 'dh1', 'rt', 'bc', 'ow', 'dw', 'im'];

/** A story stand-in for a DataField of the named class. */
function storyNode(name: string, extra: Partial<SchemaNode> = {}): SchemaNode {
    const Named = class {};
    Object.defineProperty(Named, 'name', { value: name });
    return Object.assign(Object.create(Named.prototype) as SchemaNode, extra);
}

function insert(root: Record<string, SchemaNode>, path: string, leaf: SchemaNode): void {
    const [head, ...rest] = path.split('.');
    if (rest.length === 0) {
        root[head] = leaf;
        return;
    }
    const fields: Record<string, SchemaNode> = { ...(Object.hasOwn(root, head) ? root[head].fields : {}) };
    insert(fields, rest.join('.'), leaf);
    root[head] = storyNode('SchemaField', { fields });
}

/** A story schema with a node for every path of `layout`: strings, arrays for `[]` paths, objects for `map{keys}` paths. */
function storySchema(layout: SchemaSheetLayout): SchemaNode {
    const fields: Record<string, SchemaNode> = {};
    const elements = new Map<string, Record<string, SchemaNode>>();
    for (const path of layout.sections.flatMap((section) => section.paths)) {
        const brace = path.indexOf('{');
        if (brace > 0) {
            insert(fields, path.slice(0, brace), storyNode('ObjectField'));
            continue;
        }
        const marker = path.indexOf('[]');
        if (marker < 0) {
            insert(fields, path, storyNode('StringField'));
            continue;
        }
        const list = path.slice(0, marker);
        const sub = path.slice(marker + 3);
        const element = elements.get(list) ?? {};
        elements.set(list, element);
        if (sub !== '') element[sub] = storyNode('StringField');
        insert(fields, list, storyNode('ArrayField', { element: sub === '' ? storyNode('StringField') : storyNode('SchemaField', { fields: element }) }));
    }
    return storyNode('SchemaField', { fields });
}

/** The `schemaSections` context of a sheet carrying `layout`, over `source`. */
export function mockSchemaSections(layout: SchemaSheetLayout, source: FormValue = {}): SchemaSectionView[] {
    return buildSchemaSections(layout, storySchema(layout), source);
}

/** Wrap a rendered sheet in a form, as Foundry mounts it, optionally under a game line. */
export function inForm(sheet: HTMLElement, systemId?: SystemId): HTMLFormElement {
    if (systemId !== undefined) sheet.dataset['wh40kSystem'] = systemId;
    const form = document.createElement('form');
    form.append(sheet);
    return form;
}

/**
 * The schema rows submit: each named field, edited, reaches the form data under
 * its `system.` path; and each line in `systems` (default: all seven) renders the
 * sheet with those inputs.
 */
export function playSchemaFields(
    canvasElement: HTMLElement,
    names: readonly string[],
    renderFor: (systemId: SystemId) => HTMLElement,
    systems: readonly SystemId[] = STORY_SYSTEMS,
): void {
    const form = canvasElement.querySelector('form');
    void expect(form).not.toBeNull();
    if (form === null) return;
    const submitted: FormData[] = [];
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        submitted.push(new FormData(form));
    });
    // A number input only holds a number; every other input takes a marker naming the field.
    const values = Object.fromEntries(
        names.map((name) => [name, form.querySelector(`input[type="number"][name="${name}"]`) === null ? `edited ${name}` : '7']),
    );
    submitForm(form, values);
    for (const name of names) void expect(submitted.at(0)?.get(name)).toBe(values[name]);
    for (const systemId of systems) {
        const rendered = renderFor(systemId);
        for (const name of names) void expect(rendered.querySelector(`[data-wh40k-system="${systemId}"] [name="${name}"]`)).not.toBeNull();
    }
}
