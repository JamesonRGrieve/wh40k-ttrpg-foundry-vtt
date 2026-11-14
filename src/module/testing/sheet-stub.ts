/**
 * Cast a structural test stub to the character sheet (#716).
 *
 * The sheet's context builders are `this`-typed functions in
 * `applications/actor/character/*.ts`; a test calls one with a stub exposing
 * only what that builder reads. This cast is the one sanctioned boundary, as
 * `asBaseActor` is for actors. Test-only: nothing in the runtime graph imports it.
 */
import type CharacterSheet from '../applications/actor/character-sheet.ts';

/** A stub sheet carrying only the fields the builder under test reads. */
export function asCharacterSheet(stub: object): CharacterSheet {
    // eslint-disable-next-line no-restricted-syntax -- boundary: test stubs are structural subsets of CharacterSheet; the builder under test only reads the fields the stub provides
    return stub as unknown as CharacterSheet;
}
