/**
 * Type declarations for `pack-sublevels.cjs`, the gulp pack compiler's
 * document → LevelDB record split. Hand-written so the consuming `.ts` tests are
 * typed under `tsconfig.test.json` without `allowJs`.
 */

/** Embedded collection names under one document type, nested as Foundry nests them. */
export interface EmbeddedHierarchy {
    readonly [field: string]: EmbeddedHierarchy;
}

/** A JSON value as a pack source document holds it. */
export type PackJson = string | number | boolean | null | PackJson[] | { [key: string]: PackJson };

/** A pack source document: an `_id` plus its JSON fields. */
export interface PackSourceDoc {
    _id: string;
    [field: string]: PackJson;
}

export const EMBEDDED_HIERARCHY: Readonly<Record<string, EmbeddedHierarchy>>;

/** One LevelDB put: a sublevel-prefixed key and its record. */
export interface PackRecord {
    key: string;
    value: PackSourceDoc;
}

export function packRecords(collection: string, doc: PackSourceDoc): { records: PackRecord[]; skipped: string[] };
