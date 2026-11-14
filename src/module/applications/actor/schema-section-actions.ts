/**
 * The schema rows' list controls on actor sheets (#735, #736): append an entry
 * to, or remove one from, an array the row edits. Item sheets bind the same
 * action names through `reference-list-item-sheet.ts`; the rows' partials
 * (`templates/item/partial/schema-field-row.hbs`) dispatch `addEntry` /
 * `removeEntry` with `data-path` (and `data-index`).
 */
import { buildArrayPathUpdate, type FormValueMutation, isFormObject, isFormValue, removeIndex } from '../item/reference-list-edits.ts';
import { schemaNodeAt } from '../item/schema-sheet-layout.ts';
import type BaseActorSheet from './base-actor-sheet.ts';

/** Replace the value at the `system.`-prefixed `path` with `mutate(current)`, writing a containing array whole. */
async function updateActorSystemPath(sheet: BaseActorSheet, path: string, mutate: FormValueMutation): Promise<void> {
    const source = sheet.actor.system._source;
    if (!isFormValue(source) || !isFormObject(source)) return;
    await sheet.actor.update(buildArrayPathUpdate(source, path, mutate));
}

/** Append one entry, at the element field's initial value, to the array the button names. */
export async function addEntry(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
    const { path } = target.dataset;
    if (path === undefined || !this.isEditable) return;
    const element = schemaNodeAt(this.actor.system.schema, path.replace(/^system\./, ''))?.element;
    if (element === undefined) return;
    const initial = element.getInitialValue?.({}) ?? '';
    await updateActorSystemPath(this, path, (current) => [...(Array.isArray(current) ? current : []), initial]);
}

/** Remove the array entry the button sits on. */
export async function removeEntry(this: BaseActorSheet, _event: Event, target: HTMLElement): Promise<void> {
    const { path, index } = target.dataset;
    if (path === undefined || index === undefined || !this.isEditable) return;
    await updateActorSystemPath(this, path, (current) => removeIndex(current, Number(index)));
}
