/**
 * Only War · Vehicle Movement persistence slot (#156 — core.md §"VEHICLE MOVEMENT", p.12305).
 *
 * The engine (`src/module/rules/ow-vehicle-movement.ts`) is RNG-free and
 * actor-decoupled. The only state that must persist on an OW driver is
 * the running High-Speed Chase tracker — the five vehicle movement
 * actions themselves are stateless dispatches (rolled live, posted to
 * chat, no per-actor accumulator).
 *
 * The chase tracker:
 *   - `pursuerDistance` — current distance between pursuer and target
 *                          in the GM's chosen units (typically metres).
 *                          0 means the pursuer has caught the target;
 *                          negative values are permitted (overshoot).
 *   - `dangerZone`      — true when the most recent tick triggered a
 *                          handling hazard (3+ DoF on either Operate
 *                          test, or pursuer distance ≤ 0).
 *   - `turnCount`       — number of chase rounds resolved so far.
 *
 * The wrapping `SchemaField` is `nullable: true, initial: null` so an
 * actor *not* currently in a chase persists as `chaseState === null`
 * rather than as a stub object with zeroed fields. This matches the
 * "non-chase scenes" carve-out called out in the integration brief.
 *
 * The orchestrator merges `owVehicleMovementSchemaFields()` into
 * CharacterData and NPCData's `defineSchema()` (an OW chase can be
 * driver-on-driver or driver-vs-NPC) and applies
 * `OwVehicleMovementDeclarations` via the standard `declare` block.
 */

const { SchemaField, NumberField, BooleanField } = foundry.data.fields;

/**
 * Live state of a single High-Speed Chase. Mirrors `ChaseTrackerState`
 * in the rules engine 1:1 so the persisted shape can be handed
 * straight to `tickHighSpeedChase`.
 */
export interface ChaseStateEntry {
    pursuerDistance: number;
    dangerZone: boolean;
    turnCount: number;
}

/**
 * Class-level `declare` shape contributed by the Vehicle Movement
 * schema slot. The orchestrator splices this onto CharacterData and
 * NPCData so the compiler narrows `actor.system.chaseState` to
 * `ChaseStateEntry | null` without Record casts.
 */
export interface OwVehicleMovementDeclarations {
    chaseState: ChaseStateEntry | null;
}

/**
 * Schema-field bundle for the chase tracker slot. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owVehicleMovementSchemaFields(),
 *     };
 *
 * Non-chase actors carry `chaseState === null` and the OW-gated panel
 * still renders the action catalogue; the chase readout only surfaces
 * when the tracker is non-null.
 */
export function owVehicleMovementSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        chaseState: new SchemaField(
            {
                pursuerDistance: new NumberField({ required: true, initial: 0, nullable: false }),
                dangerZone: new BooleanField({ required: true, initial: false }),
                turnCount: new NumberField({ required: true, initial: 0, min: 0, integer: true, nullable: false }),
            },
            { required: false, nullable: true, initial: null },
        ),
    };
}
