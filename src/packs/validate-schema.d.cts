/**
 * Type declarations for `validate-schema.cjs`.
 *
 * The validator is authored as node-runnable CommonJS so the pack tooling can
 * require it directly; this hand-written `.d.cts` gives the consuming `.ts`
 * tests full types under `tsconfig.test.json` without pulling the script into
 * `allowJs`. Same arrangement as `scripts/migrate-rolltable-result-types.d.mts`
 * in the system repo.
 *
 * The declarations live beside the runtime they describe — the content repo
 * ships the validator, so it ships its types.
 */

/** One rule violation: which rule, which file, and the specifics. */
export interface SchemaWarning {
    rule: string;
    file: string;
    detail: string;
}

/** Options for a whole-tree validation run. */
export interface ValidatePackSourcesOptions {
    /** Directory to walk; defaults to the validator's own directory. */
    rootDir?: string;
}

/** Validate one parsed document, pushing any violations onto `warnings`. */
export function validateDocument(doc: unknown, relFile: string, warnings: SchemaWarning[]): void;

/** Validate a `cost` block, reporting through the supplied `warn` callback. */
export function validateCost(cost: unknown, warn: (rule: string, detail?: string) => void): void;

/** Validate a `source` block, reporting through the supplied `warn` callback. */
export function validateSource(source: unknown, warn: (rule: string, detail?: string) => void): void;

/** Walk every pack `_source` tree and collect the violations found. */
export function validatePackSources(opts?: ValidatePackSourcesOptions): SchemaWarning[];
