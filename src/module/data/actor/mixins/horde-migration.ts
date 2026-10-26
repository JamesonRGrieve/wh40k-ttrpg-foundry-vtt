/**
 * Source migration for the horde block that `HordeTemplate` adds to an actor's
 * system data. Pure, so it is testable without a booted Foundry.
 */

/** Raw source data passed to DataModel migration hooks — opaque Foundry framework boundary. */
export interface MigrationSource {
    [key: string]: string | number | boolean | null | MigrationSource | MigrationSource[];
}

/** The magnitude a stored bound falls back to when it cannot be read as an integer. */
const FALLBACK_MAGNITUDE = 30;

/** Is `value` a nested source object (not an array, not null)? */
function isSourceObject(value: MigrationSource[string] | undefined): value is MigrationSource {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Coerce a horde's stored magnitude bounds to integers, in place.
 *
 * Foundry runs this on every partial update diff as well as on stored documents
 * (the client backend cleans each update with `migrate: true`). It therefore
 * touches only the keys the source carries. A diff with no horde, or with one
 * magnitude bound, passes through without gaining the missing parts. Filling
 * them in had reset a horde's maximum to 30 on every magnitude hit, and reset
 * the whole horde on any other NPC edit (#699). The schema's initial values
 * fill a new document.
 */
export function migrateHordeSource(source: MigrationSource): void {
    if (source['horde'] === null) {
        delete source['horde'];
        return;
    }
    const horde = source['horde'];
    if (!isSourceObject(horde)) return;
    const magnitude = horde['magnitude'];
    if (!isSourceObject(magnitude)) return;
    for (const bound of ['max', 'current'] as const) {
        if (!(bound in magnitude)) continue;
        const value = magnitude[bound];
        const parsed = typeof value === 'number' ? Math.trunc(value) : typeof value === 'string' ? Number.parseInt(value, 10) : Number.NaN;
        // A destroyed horde's current Magnitude is 0, a real value: only an unreadable one falls back.
        magnitude[bound] = Number.isNaN(parsed) ? FALLBACK_MAGNITUDE : parsed;
    }
}
