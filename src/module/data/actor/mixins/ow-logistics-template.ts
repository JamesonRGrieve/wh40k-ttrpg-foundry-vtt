/**
 * Only War Squad Logistics DataModel mixin (#154).
 *
 * Backs the OW Logistics engine in `src/module/rules/ow-logistics.ts`.
 * Persists the squad's standing state feeding `computeLogisticsTarget()`:
 *
 *   - `logisticsRating`    Base Squad Logistics Rating
 *                          (default {@link OW_DEFAULT_LOGISTICS_RATING}).
 *   - `munitorum`          Squad has the Munitorum Influence Talent.
 *   - `situational`        GM-set situational modifier (stable between rolls).
 *   - `logisticsFront`     The battlefront the squad is "currently operating
 *                          in": the Availability by Front Conditions table's troops deployed, time spent
 *                          in front, front active and war conditions. Standing
 *                          campaign state, so the test dialog and the armoury
 *                          requisition price against the same front (#496).
 *
 * The per-request inputs — the item's availability and craftsmanship, and
 * whether it is in a deployed regiment's standard kit — are NOT persisted:
 * they belong to one requisition, not to the squad.
 *
 * Wiring is performed by the orchestrator (see
 * `.integration-staging/154.json`):
 *   - spread `owLogisticsSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `OwLogisticsDeclarations` to the class with a `declare` block.
 *
 * Pure DataModel mixin — no actor coupling, no Foundry Document reads, no
 * UI imports.
 */

import {
    FRONT_TIME_KEYS,
    type LogisticsFront,
    OW_DEFAULT_FRONT,
    OW_DEFAULT_LOGISTICS_RATING,
    TROOP_COUNT_KEYS,
    WAR_CONDITION_KEYS,
} from '../../../rules/ow-logistics.ts';

const { NumberField, BooleanField, SchemaField, StringField } = foundry.data.fields;

function frontRow(keys: readonly string[], initial: string): foundry.data.fields.DataField.Any {
    return new StringField({ required: true, nullable: false, blank: false, initial, choices: [...keys] });
}

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
        logisticsFront: new SchemaField({
            troopCount: frontRow(TROOP_COUNT_KEYS, OW_DEFAULT_FRONT.troopCount),
            timeInFront: frontRow(FRONT_TIME_KEYS, OW_DEFAULT_FRONT.timeInFront),
            frontActive: frontRow(FRONT_TIME_KEYS, OW_DEFAULT_FRONT.frontActive),
            warCondition: frontRow(WAR_CONDITION_KEYS, OW_DEFAULT_FRONT.warCondition),
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
    /** The squad's current battlefront (the Availability by Front Conditions table's front conditions). */
    logisticsFront: LogisticsFront;
}
