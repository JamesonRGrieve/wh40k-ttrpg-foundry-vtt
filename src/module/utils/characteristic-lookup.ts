/**
 * @file Find an actor's characteristic by its key or its short name, in any case.
 *
 * Skill definitions name their characteristic by its short form in mixed case
 * (`'Int'`, `'WS'`, `'Ag'`), roll code passes the key (`'intelligence'`), and
 * players type either. Both forms match case-insensitively.
 */

/** A characteristic as the lookup reads it: its short name. */
export interface ShortNamed {
    readonly short: string;
}

/**
 * The characteristic whose key or short name matches `name`, ignoring case; undefined when none does.
 * @param {Record<string, T>} characteristics  The actor's characteristics by key.
 * @param {string} name  A key (`intelligence`) or short name (`Int`, `INT`).
 */
export function findCharacteristic<T extends ShortNamed>(characteristics: Record<string, T>, name: string): T | undefined {
    const wanted = name.toUpperCase();
    for (const [key, characteristic] of Object.entries(characteristics)) {
        if (wanted === key.toUpperCase() || wanted === characteristic.short.toUpperCase()) return characteristic;
    }
    return undefined;
}
