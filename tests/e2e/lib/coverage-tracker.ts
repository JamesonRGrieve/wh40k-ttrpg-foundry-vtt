import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Coverage tracker used by Tier B specs to record which (dimension, key)
 * pairs they exercised in a given test run. Specs append; `scripts/
 * e2e-coverage.mjs` reads at the end of the run and computes coverage
 * against the enumerable inventory dumped by `_aa_inventory.spec.ts`.
 *
 * One JSONL file per run, truncated by `_aa_inventory.spec.ts` before any
 * specs record into it.
 */
const TRACKER_PATH = resolve(__dirname, '..', '..', '..', '.e2e-runtime-coverage.jsonl');

export function recordCoverage(dimension: string, key: string): void {
    mkdirSync(dirname(TRACKER_PATH), { recursive: true });
    appendFileSync(TRACKER_PATH, `${JSON.stringify({ dimension, key })}\n`);
}

export function trackerPath(): string {
    return TRACKER_PATH;
}
