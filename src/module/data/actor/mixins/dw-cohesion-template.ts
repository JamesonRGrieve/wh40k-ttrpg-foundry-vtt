/**
 * DW Kill-team Cohesion (#162 — core.md §"COHESION", p.9351) schema slot.
 *
 * Cohesion is a kill-team SQUAD-LEVEL pool. For first integration we
 * attach it to the kill-team LEADER character. Once a dedicated
 * `dw-killteam` actor type exists, the same schema-fields function can
 * be spread there instead — that is the whole point of exporting fields
 * + a declarations interface instead of a full mixin class.
 *
 * Pure schema slot. The arithmetic + thresholds + per-turn cap live in
 * `src/module/rules/dw-cohesion.ts`; this file only persists the four
 * values the resolver reads/writes:
 *
 *   - `cohesionMax`              — derived from leader Fellowship Bonus
 *                                  + Table 7-8 (Rank/Command).
 *   - `cohesionCurrent`          — current pool value.
 *   - `cohesionLostThisTurn`     — bumped by `applyCohesionDamage`;
 *                                  driver clears it on turn boundary.
 *   - `rallied`                  — true once a successful Free-Action
 *                                  Command/Fellowship rally fires this
 *                                  turn; cleared on turn boundary.
 *
 * The orchestrator merges `dwCohesionSchemaFields()` into the
 * CharacterData defineSchema() and applies the `DwCohesionDeclarations`
 * shape to the class via the standard `declare` block. The panel and
 * actions read these fields off `system`; no class-level mixin is
 * needed for this round.
 */

const { NumberField, BooleanField } = foundry.data.fields;

/**
 * Class-level `declare` shape contributed by the Cohesion schema slot.
 * The orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.cohesionCurrent` etc. without casts.
 */
export interface DwCohesionDeclarations {
    cohesionMax: number;
    cohesionCurrent: number;
    cohesionLostThisTurn: number;
    rallied: boolean;
}

/**
 * Schema-field bundle for the Cohesion pool. Spread into a DataModel's
 * `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...dwCohesionSchemaFields(),
 *     };
 *
 * Every field has `initial: 0` (or `false` for `rallied`) so the
 * fields stay safe for non-DW actors that happen to be reflected over
 * this schema — the values exist but the panel gate keeps them
 * invisible.
 */
export function dwCohesionSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        cohesionMax: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        cohesionCurrent: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        cohesionLostThisTurn: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        rallied: new BooleanField({ required: true, initial: false }),
    };
}
