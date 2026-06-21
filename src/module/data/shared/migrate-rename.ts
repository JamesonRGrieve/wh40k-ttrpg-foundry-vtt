/**
 * Table-driven field-rename migration helper shared by the item DataModels'
 * `_migrateData` passes (#366). Each entry of `map` renames a legacy source key
 * to a current target key on the raw, pre-validation `source` blob, deleting the
 * legacy key once copied.
 *
 * Two guard modes parameterize *when* the copy happens, matching the two
 * pre-existing idioms byte-for-byte:
 *   - `'if-target-unset'` (default): rename when the legacy key is present and
 *     the target is still unset, so a value already present under the new key
 *     wins (ship-weapon's idiom: `legacyKey in source && target === undefined`).
 *   - `'overwrite'`: copy whenever the legacy key holds a defined value,
 *     overwriting any current target (weapon's `proficiency → requiredTraining`
 *     idiom: `source[legacyKey] !== undefined`).
 *
 * In every mode the legacy key is deleted once copied.
 */
export type RenameGuard = 'if-target-unset' | 'overwrite';

export interface RenameKeysOptions {
    /** When to perform the copy. Defaults to `'if-target-unset'`. */
    guard?: RenameGuard;
}

/**
 * Apply a `{ legacyKey: currentKey }` rename table to a raw source blob in place.
 * @param source The raw, pre-validation source object (mutated in place).
 * @param map A mapping from legacy key → current key.
 * @param opts Guard options controlling whether an existing target is preserved.
 */
export function renameKeys(source: Record<string, unknown>, map: Record<string, string>, opts: RenameKeysOptions = {}): void {
    const guard = opts.guard ?? 'if-target-unset';
    for (const [legacyKey, currentKey] of Object.entries(map)) {
        const shouldRename = guard === 'if-target-unset' ? legacyKey in source && source[currentKey] === undefined : source[legacyKey] !== undefined;
        if (!shouldRename) continue;
        source[currentKey] = source[legacyKey];
        delete source[legacyKey];
    }
}
