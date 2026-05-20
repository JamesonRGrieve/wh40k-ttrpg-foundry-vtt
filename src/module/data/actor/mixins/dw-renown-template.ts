/**
 * Deathwatch Renown DataModel mixin (#164).
 *
 * Provides the single schema field needed to back the Renown engine in
 * `src/module/rules/dw-renown.ts`. The engine itself is pure — this
 * module owns only the persistence shape and the typed declarations the
 * Character DataModel class spreads / declares.
 *
 * RAW reference: core.md "RENOWN" (TABLE 5-2) — Renown is a non-negative
 * integer; ranks are looked up at render time via `getRenownRank()` and
 * are NOT persisted. This keeps a single source of truth and avoids
 * rank/value drift on partial updates.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/164.json`):
 *   - spread `dwRenownSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `DwRenownDeclarations` to the class with a `declare` block
 */

const { NumberField } = foundry.data.fields;

/**
 * Schema fields produced by this mixin. Spread into `defineSchema()` on
 * the consuming DataModel:
 *
 * ```ts
 * static override defineSchema() {
 *   return {
 *     ...super.defineSchema(),
 *     ...dwRenownSchemaFields(),
 *   };
 * }
 * ```
 */
export function dwRenownSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        renown: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            nullable: false,
        }),
    };
}

/**
 * Typed declarations to be merged into the consuming DataModel class:
 *
 * ```ts
 * export default class CharacterData extends CreatureTemplate {
 *   declare renown: DwRenownDeclarations['renown'];
 *   // ...
 * }
 * ```
 *
 * Keeping this as a discrete interface lets the orchestrator add a
 * single `declare` line per field while preserving strong typing.
 */
export interface DwRenownDeclarations {
    /** Current Renown score (RAW: non-negative integer, no documented cap). */
    renown: number;
}
