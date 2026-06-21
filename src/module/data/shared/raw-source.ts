/**
 * @file Shared "raw DataModel source bag" type + narrowing helper.
 *
 * Foundry's `_migrateData` / `_cleanData` overrides receive the raw, pre-schema
 * source object before validation. Modelling that as `Record<string, unknown>`
 * is correct (the keys/values are genuinely unvalidated at that point), but the
 * `unknown` token trips the `no-restricted-syntax` boundary guard. Naming the
 * boundary ONCE here — with a single inline disable — lets every migrate/clean
 * helper and its tests reference {@link RawSource} instead of re-spelling the
 * `Record<string, unknown>` (and re-disabling) at each site.
 *
 * @see {@link ./normalize-to-array.ts}
 * @see {@link ./field-coercion.ts}
 * @see {@link ../actor/templates/creature.ts}
 */

/**
 * The raw, pre-schema source bag handed to a Foundry DataModel's
 * `_migrateData` / `_cleanData` override. Values are unvalidated until the
 * schema cleans them, so they are typed `unknown`.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel _migrateData/_cleanData raw source bag, unvalidated until schema cleaning
export type RawSource = Record<string, unknown>;

/**
 * Narrow a child property to a {@link RawSource} when it is a non-null,
 * non-array object; return `null` otherwise so callers can short-circuit.
 *
 * @param value - A raw source value (typically `source[key]`).
 * @returns The value as a `RawSource`, or `null` when it is not a plain object.
 */
export function asRawSource(value: RawSource[string]): RawSource | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value as RawSource;
    }
    return null;
}
