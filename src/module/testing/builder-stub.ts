/**
 * Cast a structural test stub to the Origin Path Builder (#717).
 *
 * The builder's handlers and commit steps are `this`-typed functions in
 * `applications/character-creation/origin-path/*.ts`; a test calls one with a
 * stub exposing only what that function reads. This cast is the one sanctioned
 * boundary, as `asBaseActor` is for actors. Test-only.
 */
import type OriginPathBuilder from '../applications/character-creation/origin-path-builder.ts';

/** A stub builder carrying only the fields the function under test reads. */
export function asOriginPathBuilder(stub: object): OriginPathBuilder {
    // eslint-disable-next-line no-restricted-syntax -- boundary: test stubs are structural subsets of OriginPathBuilder; the function under test only reads the fields the stub provides
    return stub as unknown as OriginPathBuilder;
}
