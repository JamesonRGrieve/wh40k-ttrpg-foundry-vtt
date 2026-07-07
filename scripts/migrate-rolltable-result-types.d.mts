/**
 * Type declarations for the pure transform surface of
 * `scripts/migrate-rolltable-result-types.mjs`.
 *
 * The runtime is authored as a node-runnable `.mjs`; this hand-written `.d.mts`
 * gives the `.ts` unit test (`tests/migrate-rolltable-result-types.test.ts`) full
 * types under `tsconfig.test.json` without pulling the script into `allowJs`.
 */

/** A single RollTable `TableResult` entry (open shape -- packs carry varied keys). */
export type TableResult = Record<string, unknown>;

/** A RollTable document with its embedded `results`. */
export type RollTableDoc = Record<string, unknown> & { results?: unknown };

/** True when the result still carries the legacy numeric `type`. */
export function resultTypeIsLegacyNumeric(result: unknown): boolean;

/** Return the legacy-numeric-typed results of a rolltable document (empty when none). */
export function findLegacyNumericResults(doc: unknown): TableResult[];

/**
 * Build a V13+ `documentUuid` from a legacy `documentCollection` + `documentId`.
 * Returns null when the reference is incomplete.
 */
export function buildDocumentUuid(
    documentCollection: unknown,
    documentId: unknown,
): string | null;

/** Migrate a single `TableResult` to the V13+ schema (pure, idempotent). */
export function migrateResult(result: TableResult): {
    result: TableResult;
    changed: boolean;
};

/** Migrate every result of a rolltable document (pure, idempotent). */
export function migrateRollTable(doc: RollTableDoc): {
    doc: RollTableDoc;
    changed: boolean;
    resultsMigrated: number;
};
