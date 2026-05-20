/**
 * Only War Mission Assignment Gear DataModel mixin (#155).
 *
 * Backs the OW Mission Assignment Gear engine in
 * `src/module/rules/ow-mission-gear.ts`. Per the brief, the engine has
 * NO persistent state — Table 6-3 modifiers are per-test inputs, never
 * standing actor state. The only persisted slot is `lastGearOutcome`,
 * a nullable string surfacing the most recent gear-roll outcome so the
 * panel can display "Last result: <tier>" on the next sheet open.
 *
 * `lastGearOutcome` stores the engine's `GearOutcome` discriminated
 * union as its raw string id (`surrender-kit` | `minimum-kit` |
 * `standard-kit` | `bonus-items`); the panel resolves the localized
 * label at render time. The field is `null` until the first gear roll
 * resolves.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/155.json`):
 *   - spread `owMissionGearSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `OwMissionGearDeclarations` to the class with a `declare` block.
 *
 * Pure DataModel mixin — no actor coupling, no Foundry Document reads, no
 * UI imports.
 */

import type { GearOutcome } from '../../../rules/ow-mission-gear.ts';

const { StringField } = foundry.data.fields;

/**
 * The four `GearOutcome` ids the engine produces. Mirrors the union in
 * `src/module/rules/ow-mission-gear.ts` so the schema's `choices` list
 * stays in lockstep with the rules layer.
 */
const GEAR_OUTCOME_CHOICES: ReadonlyArray<GearOutcome> = ['surrender-kit', 'minimum-kit', 'standard-kit', 'bonus-items'];

/**
 * Schema fields produced by this mixin. Spread into `defineSchema()` on
 * the consuming DataModel:
 *
 * ```ts
 * static override defineSchema() {
 *   return {
 *     ...super.defineSchema(),
 *     ...owMissionGearSchemaFields(),
 *   };
 * }
 * ```
 */
export function owMissionGearSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        lastGearOutcome: new StringField({
            required: false,
            nullable: true,
            initial: null,
            blank: false,
            choices: [...GEAR_OUTCOME_CHOICES],
        }),
    };
}

/**
 * Typed declarations to be merged into the consuming DataModel class:
 *
 * ```ts
 * export default class CharacterData extends CreatureTemplate {
 *   declare lastGearOutcome: OwMissionGearDeclarations['lastGearOutcome'];
 * }
 * ```
 */
export interface OwMissionGearDeclarations {
    /**
     * Most recent Mission Assignment Gear roll outcome, or `null` when the
     * squad has never made a gear roll on this actor. The panel reads this
     * to surface "Last result: <localized tier>" on sheet open without
     * needing to walk the chat log.
     */
    lastGearOutcome: GearOutcome | null;
}
