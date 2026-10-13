/**
 * @file Pure edit helpers behind {@link ./reference-list-item-sheet.ts ReferenceListItemSheet}:
 * the UUID-reference lists (granted traits, Marks of Distinction) and the
 * array-of-object editors (Gift riders, acquisition rolls) on the mutation and
 * special-ability sheets (#597).
 *
 * Two Foundry behaviours shape this module:
 *
 *   - An `ArrayField` is always written whole. An update keyed into an array
 *     element (`system.gift.riders.2.grants`) expands to `{riders: {2: …}}`,
 *     which the field casts to a sparse array and so drops every other rider.
 *     {@link buildArrayPathUpdate} therefore rewrites the outermost array that
 *     contains the edited path.
 *   - A form names array-element inputs by index (`system.gift.riders.0.alignment`)
 *     and only carries the inputs it renders. {@link mergeIndexedArrays} folds
 *     those partial elements back onto the stored elements, so a field the form
 *     does not show (a rider's skill modifiers or granted UUIDs) survives a submit.
 *
 * No Foundry imports.
 */

import type { DropData } from '../../managers/actor-journal-link.ts';

/** A value of item source data or expanded form data: JSON-shaped. */
export type FormValue = string | number | boolean | null | undefined | FormValue[] | FormObject;

/** A JSON-shaped plain object of item source data or expanded form data. */
export interface FormObject {
    [key: string]: FormValue;
}

/** Whether `value` is a {@link FormObject} (a plain object, not an array, not null). */
export function isFormObject(value: FormValue): value is FormObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Whether `value` is JSON-shaped all the way down — the guard that admits item
 * source data (typed `Record<string, unknown>` by the variant utilities) into
 * this module.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over Foundry's untyped item `system._source` (read via getMaterializedItemSource); narrowed on the next line
export function isFormValue(value: unknown): value is FormValue {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.every(isFormValue);
    if (typeof value !== 'object') return false;
    return Object.values(value).every(isFormValue);
}

/** Whether every key of `value` is a non-negative integer, i.e. it is an array the form expanded by index. */
function isIndexedObject(value: FormObject): boolean {
    const keys = Object.keys(value);
    return keys.length > 0 && keys.every((key) => /^\d+$/.test(key));
}

/**
 * Fold a form's partial, index-keyed array elements onto the stored arrays.
 *
 * `submitted` is the expanded form data for a subtree and `stored` the matching
 * source subtree. Wherever the form produced an index-keyed object and the
 * source holds an array, the result is a full array: every stored element, with
 * the submitted fields of that index merged over it (nested plain objects merge
 * per key). Outside arrays the submitted data keeps exactly the keys the form
 * sent, so the update stays as narrow as the form.
 */
export function mergeIndexedArrays(submitted: FormValue, stored: FormValue): FormValue {
    if (!isFormObject(submitted)) return submitted;
    if (Array.isArray(stored) && isIndexedObject(submitted)) {
        return stored.map((element, index) => {
            const key = String(index);
            return key in submitted ? mergeOver(element, submitted[key]) : element;
        });
    }
    if (!isFormObject(stored)) return submitted;
    const merged: FormObject = {};
    for (const [key, value] of Object.entries(submitted)) {
        merged[key] = mergeIndexedArrays(value, stored[key]);
    }
    return merged;
}

/** `stored` with `submitted` merged over it: every stored key kept, plain objects merged per key, arrays expanded by index. */
function mergeOver(stored: FormValue, submitted: FormValue): FormValue {
    if (!isFormObject(submitted)) return submitted;
    if (Array.isArray(stored)) return mergeIndexedArrays(submitted, stored);
    if (!isFormObject(stored)) return submitted;
    const merged: FormObject = { ...stored };
    for (const [key, value] of Object.entries(submitted)) {
        merged[key] = mergeOver(stored[key], value);
    }
    return merged;
}

/** A single-key document update, `{ "system.<path>": value }`. */
export type PathUpdate = FormObject;

/** Replaces the value at an edited path. */
export type FormValueMutation = (current: FormValue) => FormValue;

/** The `system`-relative segments of a `system.`-prefixed form path. Throws on any other path. */
export function systemPathSegments(path: string): string[] {
    const segments = path.split('.');
    if (segments[0] !== 'system' || segments.length < 2 || segments.some((s) => s === '')) {
        throw new Error(`reference-list-edits: "${path}" is not a system.* field path`);
    }
    return segments.slice(1);
}

/** The child of `container` at `segment` — an index for an array, a key for an object. */
function childAt(container: FormValue, segment: string): FormValue {
    if (Array.isArray(container)) return container[Number(segment)];
    return isFormObject(container) ? container[segment] : undefined;
}

/**
 * Build the update that replaces the value at `path` with `mutate(current)`.
 *
 * `systemSource` is the item's `system` source. When `path` passes through an
 * array, the update rewrites that whole (outermost) array with the one element
 * changed, because an `ArrayField` cannot be patched by index. Otherwise it is a
 * plain `{ [path]: value }` update.
 */
export function buildArrayPathUpdate(systemSource: FormObject, path: string, mutate: FormValueMutation): PathUpdate {
    const segments = systemPathSegments(path);
    let cursor: FormValue = systemSource;
    for (const [depth, segment] of segments.entries()) {
        if (Array.isArray(cursor)) {
            const arrayPath = ['system', ...segments.slice(0, depth)].join('.');
            return { [arrayPath]: replaceNested(cursor, segments.slice(depth), mutate) };
        }
        cursor = childAt(cursor, segment);
    }
    return { [path]: mutate(Array.isArray(cursor) ? structuredClone(cursor) : cursor) };
}

/**
 * A copy of `container` with the value reached by `segments` replaced by
 * `mutate(current)`. A path that runs into a scalar leaves the copy unchanged.
 */
function replaceNested(container: FormValue, segments: readonly string[], mutate: FormValueMutation): FormValue {
    const segment = segments.at(0);
    if (segment === undefined) return mutate(structuredClone(container));
    const rest = segments.slice(1);
    if (Array.isArray(container)) {
        const index = Number(segment);
        return container.map((element, i) => (i === index ? replaceNested(element, rest, mutate) : structuredClone(element)));
    }
    if (isFormObject(container)) {
        return { ...structuredClone(container), [segment]: replaceNested(container[segment], rest, mutate) };
    }
    return structuredClone(container);
}

/** The string entries of a stored list; anything else reads as empty. */
export function stringList(value: FormValue): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** `list` with `uuid` appended, unless it is already present. */
export function appendUniqueUuid(list: FormValue, uuid: string): string[] {
    const entries = stringList(list);
    return entries.includes(uuid) ? entries : [...entries, uuid];
}

/** `list` without the element at `index`. An out-of-range index returns the list unchanged. */
export function removeIndex(list: FormValue, index: number): FormValue[] {
    if (!Array.isArray(list)) return [];
    return list.filter((_entry, i) => i !== index);
}

/** The UUID an Item drag payload carries, or `null` for any other drop. */
export function itemUuidFromDropData(data: DropData): string | null {
    if (typeof data !== 'object' || data === null || !('type' in data) || !('uuid' in data)) return null;
    const { type, uuid } = data;
    return type === 'Item' && typeof uuid === 'string' && uuid !== '' ? uuid : null;
}

/** The slice of a dropped item that {@link acceptsDroppedItem} reads. */
export interface DroppedItemLike {
    type: string;
    system: object;
}

/** One accept token split into its item type and optional category (`specialAbility:mark`). */
function parseAcceptToken(token: string): { type: string; category: string | null } {
    const separator = token.indexOf(':');
    return separator === -1 ? { type: token, category: null } : { type: token.slice(0, separator), category: token.slice(separator + 1) };
}

/**
 * Whether a drop zone accepts `item`. `accept` is a comma-separated list of
 * `type` or `type:category` tokens: `trait,talent` takes any trait or talent,
 * `specialAbility:mark` takes only a special ability whose `category` is `mark`.
 */
export function acceptsDroppedItem(accept: string, item: DroppedItemLike): boolean {
    const category = 'category' in item.system && typeof item.system.category === 'string' ? item.system.category : null;
    return accept
        .split(',')
        .map((token) => token.trim())
        .filter((token) => token !== '')
        .map(parseAcceptToken)
        .some((wanted) => wanted.type === item.type && (wanted.category === null || wanted.category === category));
}

/** How a drop zone stores what is dropped on it. */
export type ReferenceMode = 'list' | 'single';

/** Whether `value` is a {@link ReferenceMode}. */
export function isReferenceMode(value: string | undefined): value is ReferenceMode {
    return value === 'list' || value === 'single';
}

/** One displayed reference: the stored UUID and its resolved display name. */
interface ReferenceEntry {
    uuid: string;
    name: string;
    /** Position in a list reference; `-1` for a single reference. */
    index: number;
}

/** Context for the shared `reference-list.hbs` partial. */
export interface ReferenceListContext {
    /** Form path of the stored UUID list or single UUID. */
    path: string;
    mode: ReferenceMode;
    /** Drop-zone accept tokens, see {@link acceptsDroppedItem}. */
    accept: string;
    entries: ReferenceEntry[];
    /** Langpack key shown when nothing is referenced (read-only). */
    emptyKey: string;
    /** Langpack key of the drop-zone prompt (edit mode). */
    dropKey: string;
}

/** Resolves a stored UUID to a display name. */
export type UuidNameResolver = (uuid: string) => string;

/** The common arguments of {@link buildReferenceList}. */
interface ReferenceListArgs {
    path: string;
    accept: string;
    resolveName: UuidNameResolver;
    emptyKey: string;
    dropKey: string;
}

/**
 * Build a {@link ReferenceListContext} for a stored UUID list (`mode: 'list'`)
 * or a single stored UUID (`mode: 'single'`, blank = nothing referenced).
 */
export function buildReferenceList(
    args: ReferenceListArgs & ({ mode: 'list'; stored: readonly string[] } | { mode: 'single'; stored: string }),
): ReferenceListContext {
    const entries =
        args.mode === 'list'
            ? args.stored.map((uuid, index) => ({ uuid, name: args.resolveName(uuid), index }))
            : args.stored === ''
            ? []
            : [{ uuid: args.stored, name: args.resolveName(args.stored), index: -1 }];
    return { path: args.path, mode: args.mode, accept: args.accept, entries, emptyKey: args.emptyKey, dropKey: args.dropKey };
}

/** A `<select>` option for the content-block panels. */
export interface SelectOption {
    value: string;
    labelKey: string;
    selected: boolean;
}

/** An embedded Active Effect, as the effect pickers list it. */
export interface EffectChoice {
    id: string;
    name: string;
}

/** A `<select>` option whose label is literal text rather than a langpack key. */
export interface LiteralOption {
    value: string;
    label: string;
    selected: boolean;
}

/**
 * Options for an "apply this embedded Active Effect" picker. A stored id that no
 * longer names an embedded effect stays listed (by its raw id) so a submit never
 * silently clears it.
 */
export function effectOptions(effects: readonly EffectChoice[], current: string): LiteralOption[] {
    const options = effects.map((effect) => ({ value: effect.id, label: effect.name, selected: effect.id === current }));
    if (current !== '' && !effects.some((effect) => effect.id === current)) {
        options.push({ value: current, label: current, selected: true });
    }
    return options;
}

/** The display name of the effect `id` names, `''` for none, the raw id when it no longer resolves. */
export function effectName(effects: readonly EffectChoice[], id: string): string {
    if (id === '') return '';
    return effects.find((effect) => effect.id === id)?.name ?? id;
}
