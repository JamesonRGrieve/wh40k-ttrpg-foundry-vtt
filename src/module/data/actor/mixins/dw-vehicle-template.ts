/**
 * DW Vehicle Critical Hit / Repair (#170 — rites.md §"DAMAGING VEHICLES",
 * Table 4-2 p. 5823, §"REPAIRING VEHICLES" p. 5845) schema slot.
 *
 * Vehicles in Deathwatch can be either *player-owned* (a Battle-Brother
 * gunner / pilot of a kill-team transport) or *NPC-owned* (a hostile
 * gun-wagon or transport). The schema fields therefore apply to BOTH
 * CharacterData and NPCData. Non-vehicle actors carry the slot at
 * default 0 and the panel gate (`isDW` + a future is-vehicle flag) keeps
 * them invisible.
 *
 * Pure schema slot. The chart math, repair-difficulty table, and
 * kill-team acquisition gate live in `src/module/rules/dw-vehicle-crit.ts`;
 * this file only persists the two values the resolver reads/writes:
 *
 *   - `vehicleIntegrity` — current Structural Integrity remaining.
 *                          When this drops below zero the excess flows
 *                          into `overIntegrity`.
 *   - `overIntegrity`    — cumulative over-Integrity damage; added to
 *                          1d10 on every subsequent Critical Hit lookup
 *                          (RAW Table 4-2 is cumulative).
 *
 * The orchestrator merges `dwVehicleSchemaFields()` into both
 * CharacterData and NPCData's `defineSchema()` and applies the
 * `DwVehicleDeclarations` shape via the standard `declare` block. The
 * panel and actions read these fields off `system`; no class-level
 * mixin is needed for this round.
 */

const { NumberField } = foundry.data.fields;

/**
 * Class-level `declare` shape contributed by the Vehicle schema slot.
 * The orchestrator splices these declarations onto BOTH CharacterData
 * and NPCData so the compiler narrows `actor.system.vehicleIntegrity`
 * and `actor.system.overIntegrity` without casts.
 */
export interface DwVehicleDeclarations {
    vehicleIntegrity: number;
    overIntegrity: number;
}

/**
 * Schema-field bundle for the vehicle Integrity / over-Integrity pair.
 * Spread into a DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...dwVehicleSchemaFields(),
 *     };
 *
 * Both fields default to 0 and are clamped non-negative integers, so
 * non-vehicle actors that happen to be reflected over this schema carry
 * inert values that the panel gate hides. The resolver in
 * `rules/dw-vehicle-crit.ts` already coerces negative / non-finite
 * inputs defensively; the schema clamp is the first line of defence.
 */
export function dwVehicleSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        vehicleIntegrity: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
        overIntegrity: new NumberField({ required: true, initial: 0, min: 0, integer: true }),
    };
}
