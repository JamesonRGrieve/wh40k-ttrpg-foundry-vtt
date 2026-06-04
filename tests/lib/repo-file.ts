/**
 * Re-export of `readRepoFile` for non-co-located `tests/**` suites (#312).
 *
 * The canonical implementation lives at `src/module/testing/repo-file.ts` (the
 * #270 home); `tests/**` reach it through this thin re-export, keeping one
 * implementation and one repo-root resolution scheme.
 */
export { readRepoFile } from '../../src/module/testing/repo-file.ts';
