/**
 * Gate for tests that read the private, copyrighted content (the
 * `src/packs-private` submodule).
 *
 * That content is a separate private repo: local checkouts and the campaign deploy
 * have it, CI and public clones do not (ci.yml checks out with `submodules: false`).
 * A suite that asserts against real pack data is declared
 * `describe.skipIf(!HAS_PRIVATE_CONTENT)('…', …)`, so it runs wherever the content
 * exists and is reported as skipped (not failed) where it cannot. Suites that
 * exercise code with inline fixtures stay ungated and run everywhere.
 *
 * Test-only: no runtime module imports this.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The private content root, `src/packs-private` (this file is three levels below the repo root). */
const PRIVATE_CONTENT_ROOT = resolve(__dirname, '..', '..', '..', 'src', 'packs-private');

/**
 * Is the private content checked out? Keyed on its pack-declaration fragment, which
 * every populated checkout carries (an uninitialised submodule is an empty dir).
 */
export const HAS_PRIVATE_CONTENT = existsSync(resolve(PRIVATE_CONTENT_ROOT, 'system.packs.json'));
