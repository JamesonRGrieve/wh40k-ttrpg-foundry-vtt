/**
 * Only War Squad Logistics DataModel mixin (#154).
 *
 * Backs the OW Logistics engine in `src/module/rules/ow-logistics.ts`.
 * Persists the three actor-owned scalars feeding `computeLogisticsTarget()`:
 *
 *   - `logisticsRating`    Base Squad Logistics Rating
 *                          (default {@link OW_DEFAULT_LOGISTICS_RATING}).
 *   - `munitorum`          Squad has the Munitorum Influence Talent.
 *   - `situational`        GM-set situational modifier (stable between rolls).
 *
 * The per-axis selectors of Table 6-2 (troop count, time in front, front
 * activity, war condition, craftsmanship, standard kit) are NOT persisted
 * on the actor — they are per-test inputs collected by
 * `LogisticsTestDialog` at roll time and live only on the chat card.
 * Persisting them on the actor would conflate the squad's standing state
 * with the situational state of a single requisition.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/154.json`):
 *   - spread `owLogisticsSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `OwLogisticsDeclarations` to the class with a `declare` block.
 *
 * Pure DataModel mixin — no actor coupling, no Foundry Document reads, no
 * UI imports.
 */

import { OW_DEFAULT_LOGISTICS_RATING } from '../../../rules/ow-logistics.ts';

const { NumberField, BooleanField } = foundry.data.fields;

/**
 * Schema fields produced by this mixin. Spread into `defineSchema()` on
 * the consuming DataModel:
 *
 * ```ts
 * static override defineSchema() {
 *   return {
 *     ...super.defineSchema(),
 *     ...owLogisticsSchemaFields(),
 *   };
 * }
 * ```
 */
export function owLogisticsSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        logisticsRating: new NumberField({
            required: true,
            initial: OW_DEFAULT_LOGISTICS_RATING,
            min: 0,
            integer: true,
            nullable: false,
        }),
        munitorum: new BooleanField({
            required: true,
            initial: false,
            nullable: false,
        }),
        situational: new NumberField({
            required: true,
            initial: 0,
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
 *   declare logisticsRating: OwLogisticsDeclarations['logisticsRating'];
 *   declare munitorum:       OwLogisticsDeclarations['munitorum'];
 *   declare situational:     OwLogisticsDeclarations['situational'];
 * }
 * ```
 */
export interface OwLogisticsDeclarations {
    /** Base Squad Logistics Rating — d100 target before per-axis modifiers. */
    logisticsRating: number;
    /** True iff a squad member has the Munitorum Influence Talent (+5 to rating). */
    munitorum: boolean;
    /** GM standing-state situational modifier in points (commonly ±5). */
    situational: number;
}
