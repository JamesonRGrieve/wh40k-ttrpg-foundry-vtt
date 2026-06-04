/**
 * Repo-root-relative file reader for source-scan regression tests (#312).
 *
 * The "guard" tests `readFileSync` a template/source and assert `.toContain(...)`.
 * Each previously re-declared `readFileSync(resolve(__dirname, <varying ../ depth>, p))`
 * — a path lambda whose `../` depth differed by where the test file lived. This
 * resolves against one repo-root constant so every call passes a single
 * root-relative path, regardless of whether the test is co-located under
 * `src/module/**` or lives under `tests/**`.
 *
 * Lives in `src/module/testing/` (the #270 home) so co-located tests import it
 * without a cross-rootDir hop; `tests/**` reach it via `tests/lib/repo-file.ts`.
 * Test-only: `node:fs` is never loaded at runtime — no runtime module imports this.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Repository root: `src/module/testing/` is three directories below it. */
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

/** Read a UTF-8 repo file by its path relative to the repository root. */
export function readRepoFile(relPathFromRoot: string): string {
    return readFileSync(resolve(REPO_ROOT, relPathFromRoot), 'utf8');
}
