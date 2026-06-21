/**
 * @file Set/string → array normalization for DataModel `_cleanData`.
 *
 * Several item DataModels declare `SetField`s whose schema `initial` is a
 * `new Set()` for in-memory ergonomics. Foundry's persistence layer
 * JSON-serializes the cleaned source, and Sets are NOT JSON-serializable —
 * they round-trip to `{}` on save, which then fails `SetField` validation on
 * the next load, causing `Item.create` to silently return `null` (the whole
 * item is dropped). Every such model must convert its `Set` source values to
 * plain arrays inside `_cleanData`, before Foundry serializes.
 *
 * This module is the single source of truth for that guard. It also handles
 * the legacy-import case where a value arrives as a comma-or-single string
 * (pre-migration pack data) that must become an array of the same shape.
 *
 * @see {@link ../item/ship-weapon.ts}
 * @see {@link ../item/ship-component.ts}
 * @see {@link ../item/armour-modification.ts}
 * @see {@link ../item/weapon-modification.ts}
 */

/**
 * How a *string* source value (rather than a Set) should be coerced to an array.
 * - `'none'`: leave strings untouched — only Sets are converted.
 * - `'wrap'`: a string `s` becomes `[s]` (single-element array).
 * - `'split'`: a string `s` becomes `s.split(',').map(trim)` (comma-separated list).
 *
 * Set values are always converted to arrays regardless of this option.
 */
export type StringMode = 'none' | 'wrap' | 'split';

interface NormalizeOptions {
    /** How to coerce a raw string value to an array. Defaults to `'none'`. */
    stringMode?: StringMode;
}

/**
 * Coerce a single Set/string value into a plain array, preserving the exact
 * legacy idioms used by the `_cleanData` call sites. Returns the value
 * unchanged when it is already an array, `null`/`undefined`, or a string the
 * configured `stringMode` does not handle.
 *
 * @param value      The raw source value (Set, string, array, or null/undefined).
 * @param stringMode How a string value should be split (see {@link StringMode}).
 * @returns The normalized value — an array when conversion applied, else `value`.
 */
function coerce(value: unknown, stringMode: StringMode): unknown {
    if (value === null || value === undefined || Array.isArray(value)) return value;
    if (value instanceof Set) return Array.from(value as Set<unknown>);
    if (typeof value === 'string') {
        if (stringMode === 'wrap') return [value];
        if (stringMode === 'split') return value.split(',').map((s) => s.trim());
    }
    return value;
}

/**
 * Normalize `source[key]` from a Set (or, per `stringMode`, a string) to a
 * plain array in place. No-op when the value is already an array or absent.
 *
 * @param source     The raw `_cleanData` source object (may be undefined).
 * @param key        The top-level field key to normalize.
 * @param options    String-coercion behaviour (see {@link NormalizeOptions}).
 */
export function normalizeToArray(source: Record<string, unknown> | undefined, key: string, options: NormalizeOptions = {}): void {
    if (!source || !(key in source)) return;
    source[key] = coerce(source[key], options.stringMode ?? 'none');
}

/**
 * Normalize `source[parentKey][childKey]` from a Set (or string) to a plain
 * array in place — the nested variant for `restrictions.*` SetFields. No-op
 * when the parent is missing/not an object or the child value is absent.
 *
 * @param source     The raw `_cleanData` source object (may be undefined).
 * @param parentKey  The parent SchemaField key (e.g. `'restrictions'`).
 * @param childKey   The nested SetField key (e.g. `'armourTypes'`).
 * @param options    String-coercion behaviour (see {@link NormalizeOptions}).
 */
export function normalizeNestedToArray(
    source: Record<string, unknown> | undefined,
    parentKey: string,
    childKey: string,
    options: NormalizeOptions = {},
): void {
    if (!source) return;
    const parent = source[parentKey];
    if (parent === null || typeof parent !== 'object' || Array.isArray(parent)) return;
    const parentRecord = parent as Record<string, unknown>;
    if (!(childKey in parentRecord)) return;
    parentRecord[childKey] = coerce(parentRecord[childKey], options.stringMode ?? 'none');
}
