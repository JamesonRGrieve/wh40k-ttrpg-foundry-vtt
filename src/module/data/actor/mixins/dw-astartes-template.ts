/**
 * Deathwatch Astartes baseline DataModel mixin (#167).
 *
 * Persists the set of implant ids the character possesses. The rules
 * engine in `src/module/rules/dw-astartes.ts` (Unnatural Str/Tgh ×2,
 * Black Carapace power-armour interface, the 19-implant registry) is
 * pure — this module owns only the persistence shape and the typed
 * declarations the Character DataModel class spreads / declares.
 *
 * RAW reference: core.md "The Adeptus Astartes" / "Implants of the
 * Astartes" / "Black Carapace". Each implant id is one of the 19
 * canonical strings declared by {@link AstartesImplantId} in
 * `src/module/rules/dw-astartes.ts`; the schema stores them as raw
 * strings so legacy / future ids round-trip unchanged through migration.
 * Validation against the canonical list happens at the rules-engine
 * boundary, not at the schema level — keeping the persisted shape
 * forward-compatible with content additions that ship via compendium
 * before the engine knows about them (Direction #7).
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/167.json`):
 *   - spread `dwAstartesSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `DwAstartesDeclarations` to the class with a `declare` block
 */

import type { AstartesImplantId } from '../../../rules/dw-astartes.ts';

const { ArrayField, StringField } = foundry.data.fields;

/**
 * Schema fields produced by this mixin. Spread into `defineSchema()` on
 * the consuming DataModel:
 *
 * ```ts
 * static override defineSchema() {
 *   return {
 *     ...super.defineSchema(),
 *     ...dwAstartesSchemaFields(),
 *   };
 * }
 * ```
 *
 * `implants` is an ordered array of implant ids the character has.
 * Order is preserved (cosmetic, e.g. the order the user toggled them
 * on); duplicates are collapsed by the toggle action handler, not the
 * schema. Unknown / future ids are tolerated — the rules engine
 * decides what it knows how to dispatch on.
 */
export function dwAstartesSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        implants: new ArrayField(new StringField({ required: true, blank: false }), {
            required: true,
            initial: [],
        }),
    };
}

/**
 * Typed declarations to be merged into the consuming DataModel class:
 *
 * ```ts
 * export default class CharacterData extends CreatureTemplate {
 *   declare implants: DwAstartesDeclarations['implants'];
 *   // ...
 * }
 * ```
 *
 * The element type is the canonical `AstartesImplantId` union from the
 * rules engine — the schema stores raw strings (to round-trip unknowns
 * cleanly) but every code path that reads the field at the DataModel
 * surface expects canonical ids, and any non-canonical id flowing
 * through there is a bug to surface at the type system, not paper over.
 */
export interface DwAstartesDeclarations {
    /** Implant ids the character has (RAW: subset of the 19 canonical Astartes implants). */
    implants: AstartesImplantId[];
}
