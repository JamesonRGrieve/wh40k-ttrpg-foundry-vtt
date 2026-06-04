/**
 * Re-export of the shared actor-stub cast for non-co-located `tests/**` suites.
 *
 * The canonical implementation lives at `src/module/testing/actor-stub.ts` so
 * that co-located `src/module/**` tests can import it without tripping the main
 * tsconfig's `rootDir: "src"` (TS6059). `tests/**` files (compiled under
 * `tsconfig.test.json` with `rootDir: "."`) reach it through this thin
 * re-export, keeping a single implementation (#270).
 */
export { asBaseActor } from '../../src/module/testing/actor-stub.ts';
