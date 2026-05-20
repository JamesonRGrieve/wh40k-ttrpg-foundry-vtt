/**
 * Deathwatch Requisition DataModel mixin (#165 — core.md §"REQUISITION",
 * p. 5845, Tables 5-1 and 5-3).
 *
 * Exposes the two persisted fields a Battle-Brother's character record
 * needs in order to drive the requisition engine in
 * `src/module/rules/dw-requisition.ts`:
 *
 *   - `requisitionPoints` — the actor's currently-available RP pool.
 *     Spent down by `dwRequisitionItem` / `dwRequisitionPool` actions;
 *     replenished by the mission award (computed from
 *     `missionRating` + brother count via `computeMissionRpBudget`).
 *   - `missionRating` — the current mission's rating tier. The RP-per-
 *     brother table itself is compendium content per Direction #7; this
 *     field only persists *which* tier is in force.
 *
 * The mixin follows the "schema fields + declarations type" shape — it
 * exports a function that returns a `Record<string, DataField>` to be
 * spread into the host DataModel's `defineSchema()`, and a `declare`-
 * intent type for the host class to apply with `declare`. The host
 * (`CharacterData` / `NPCData`) owns the wiring; this file owns the
 * field shapes and bounds.
 */

import type { MissionRating } from '../../../rules/dw-requisition.ts';

const { NumberField, StringField } = foundry.data.fields;

/**
 * Canonical mission-rating identifiers, ordered ascending. Used by the
 * StringField `choices` constraint and by callers that need to iterate
 * the tiers (UI dropdowns, mission-rating select panels).
 */
export const DW_MISSION_RATINGS: readonly MissionRating[] = ['standard', 'extended', 'priority', 'critical'] as const;

/**
 * Instance declarations the host DataModel class must apply via
 * `declare`. Mirrors the schema below so `this.requisitionPoints` /
 * `this.missionRating` is typed at every call site.
 */
export interface DwRequisitionDeclarations {
    requisitionPoints: number;
    missionRating: MissionRating;
}

/**
 * Schema fields contributed by the Deathwatch requisition template.
 * Spread this into the host DataModel's `defineSchema()` return value:
 *
 * ```ts
 * static override defineSchema() {
 *     return {
 *         ...super.defineSchema(),
 *         ...dwRequisitionSchemaFields(),
 *         // … other host fields
 *     };
 * }
 * ```
 *
 * Field shapes:
 *   - `requisitionPoints`: integer ≥ 0, initial 0. The actor's
 *     currently-available RP. Spent at requisition time; refilled by
 *     mission-budget grants.
 *   - `missionRating`: choice of {@link DW_MISSION_RATINGS}, initial
 *     `'standard'`. Drives the mission RP grant via the policy table.
 */
export function dwRequisitionSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        requisitionPoints: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            nullable: false,
        }),
        missionRating: new StringField({
            required: true,
            initial: 'standard',
            blank: false,
            // The cast is safe — the array is `readonly MissionRating[]`
            // and the StringField only inspects the choice values.
            choices: [...DW_MISSION_RATINGS],
        }),
    };
}
