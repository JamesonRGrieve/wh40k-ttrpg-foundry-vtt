/**
 * Type declarations for `pack-reference.cjs`, the shared reference-stub
 * resolution. Hand-written so the consuming `.ts` tests are typed under
 * `tsconfig.test.json` without `allowJs`.
 */

/** A JSON value as a pack source document holds it. */
export type PackJson = string | number | boolean | null | PackJson[] | { [key: string]: PackJson };

/** A parsed pack source document. */
export interface PackDocument {
    [field: string]: PackJson;
}

/** Keys that replace the resolved body's value outright. */
export declare const STUB_IDENTITY_KEYS: readonly ['name', '_id', 'img'];

/** Every key a stub may carry besides `reference`. */
export declare const STUB_OVERRIDE_KEYS: readonly ['name', '_id', 'img', 'system', 'addItems'];

export declare function isReferenceStub(doc: unknown): doc is PackDocument & { reference: string };

export declare function deepMergeOverlay(base: PackJson | undefined, overlay: PackJson): PackJson;

export declare function applyReferenceOverrides(resolved: PackDocument, stub: PackDocument & { reference: string }): PackDocument;
