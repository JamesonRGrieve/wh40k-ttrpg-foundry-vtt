/**
 * Shared actor-stub cast for unit tests (#270).
 *
 * Several rule/config/util tests build a minimal structural stand-in for an
 * actor (an `interface Fake*Actor` exposing only the few fields the function
 * under test reads) and cast it to {@link WH40KBaseActorDocument}. That cast is
 * the one sanctioned boundary — concentrating it here removes the per-file
 * `as unknown as WH40KBaseActorDocument` plus its own `eslint-disable` from each
 * test.
 *
 * Lives under `src/module/` (not `tests/`) because the consuming tests are
 * co-located in `src/module/**`, which the main tsconfig compiles with
 * `rootDir: "src"`; a `tests/`-rooted helper would trip TS6059 on import. The
 * file is test-only — nothing in the runtime import graph references it, so it
 * is never bundled into the shipped system.
 */
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

/**
 * Cast a structural test actor stub to the Foundry `WH40KBaseActorDocument`
 * surface the rule/document helpers consume. Test stubs implement only the
 * handful of fields a given helper reads.
 */
export function asBaseActor(stub: object): WH40KBaseActorDocument {
    // eslint-disable-next-line no-restricted-syntax -- boundary: test stubs are structural subsets of WH40KBaseActorDocument; helpers under test only read the fields the stub provides
    return stub as unknown as WH40KBaseActorDocument;
}
