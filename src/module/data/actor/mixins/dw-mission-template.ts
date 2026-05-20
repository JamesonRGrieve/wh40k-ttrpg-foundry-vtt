/**
 * Deathwatch Mission framework DataModel mixin (#169 — core.md §"MISSIONS"
 * p. 10115 / §"REWARDS" p. 10390).
 *
 * Owns the persisted shape behind the Mission engine in
 * `src/module/rules/dw-mission.ts`. The engine is pure arithmetic; this
 * mixin holds the GM-authored mission record currently in force for the
 * actor (typically the kill-team leader during a Battle-Brother arc).
 *
 * Shape:
 *   - `activeMission` — nullable SchemaField. `null` between missions; a
 *     populated record while the kill-team is engaged on a mission. The
 *     resolver in `dw-mission.ts` reads each populated field directly,
 *     so the schema mirrors the engine's `DwMission` interface 1:1.
 *
 *     - `id`, `name`            — stable identifier + display label.
 *     - `rating`                — one of {@link DW_MISSION_RATINGS}.
 *     - `objectives`            — list of objective records (id, label,
 *                                 rewards, status).
 *     - `complications`         — list of complication records (id,
 *                                 label, renown penalty).
 *
 * Each list is bounded only by sensible non-negative integer constraints
 * on the reward / penalty fields — the engine itself clamps non-finite
 * authoring inputs to 0 (`nonNegative`) and clamps the total Renown at
 * `RENOWN_MIN`, so the schema can be permissive here.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/169.json`):
 *   - spread `dwMissionSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `DwMissionDeclarations` to the class with a `declare` block
 */

import type { MissionComplication, MissionObjective, MissionRating } from '../../../rules/dw-mission.ts';

const { ArrayField, BooleanField, NumberField, SchemaField, StringField } = foundry.data.fields;

/**
 * Canonical mission-rating identifiers (matches the union in the engine).
 * Exposed as a runtime array so the SchemaField `choices` constraint and
 * UI selectors can iterate without re-deriving from the type-only union.
 */
export const DW_MISSION_RATINGS: readonly MissionRating[] = ['standard', 'extended', 'priority', 'critical'] as const;

/**
 * Objective lifecycle states (matches `ObjectiveStatus` on the engine).
 * The panel cycles `pending` → `complete` → `failed` → `pending`.
 */
export const DW_OBJECTIVE_STATUSES = ['pending', 'complete', 'failed'] as const;

/**
 * Persisted shape of a single objective. Mirrors the engine's
 * {@link MissionObjective} interface exactly so the resolver can consume
 * `activeMission.objectives` without a structural cast.
 */
export type DwMissionObjectiveData = MissionObjective;

/**
 * Persisted shape of a single complication. Mirrors the engine's
 * {@link MissionComplication} interface exactly.
 */
export interface DwMissionComplicationData extends MissionComplication {
    /** GM-toggled trigger flag — `true` once the complication has fired during play. */
    triggered: boolean;
}

/**
 * Persisted shape of the active mission record. `null` between missions.
 *
 * The complication shape adds a `triggered` boolean that the engine does
 * NOT carry directly (the engine receives a separate `complicationsTriggered`
 * id list at payout time). The DataModel keeps the flag on each record so
 * the panel can toggle it stand-alone; the action handler derives the id
 * list from `triggered === true` entries.
 */
export interface DwActiveMissionData {
    id: string;
    name: string;
    rating: MissionRating;
    objectives: DwMissionObjectiveData[];
    complications: DwMissionComplicationData[];
}

/**
 * Class-level `declare` shape contributed by the Mission schema slot.
 * The orchestrator splices this onto CharacterData so the compiler
 * narrows `actor.system.activeMission` without casts.
 */
export interface DwMissionDeclarations {
    activeMission: DwActiveMissionData | null;
}

/**
 * Schema-field bundle for the Mission record. Spread into a DataModel's
 * `defineSchema()`:
 *
 * ```ts
 * static override defineSchema() {
 *     return {
 *         ...super.defineSchema(),
 *         ...dwMissionSchemaFields(),
 *     };
 * }
 * ```
 *
 * The wrapping `SchemaField` is `nullable: true, initial: null` so an
 * actor between missions persists as `activeMission === null` rather
 * than as a stub object with empty arrays.
 */
export function dwMissionSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        activeMission: new SchemaField(
            {
                id: new StringField({ required: true, blank: false, initial: 'mission' }),
                name: new StringField({ required: true, blank: false, initial: 'Mission' }),
                rating: new StringField({
                    required: true,
                    blank: false,
                    initial: 'standard',
                    choices: [...DW_MISSION_RATINGS],
                }),
                objectives: new ArrayField(
                    new SchemaField({
                        id: new StringField({ required: true, blank: false }),
                        description: new StringField({ required: true, blank: true, initial: '' }),
                        renownReward: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
                        xpReward: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
                        status: new StringField({
                            required: true,
                            blank: false,
                            initial: 'pending',
                            choices: [...DW_OBJECTIVE_STATUSES],
                        }),
                    }),
                    { required: true, initial: [] },
                ),
                complications: new ArrayField(
                    new SchemaField({
                        id: new StringField({ required: true, blank: false }),
                        description: new StringField({ required: true, blank: true, initial: '' }),
                        renownPenalty: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
                        triggered: new BooleanField({ required: true, initial: false }),
                    }),
                    { required: true, initial: [] },
                ),
            },
            { required: false, nullable: true, initial: null },
        ),
    };
}
