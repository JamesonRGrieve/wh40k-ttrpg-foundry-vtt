/**
 * Black Crusade Chaos Ritual DataModel mixin (#179).
 *
 * Persists the minimum state the pure resolvers in
 * `src/module/rules/bc-chaos-ritual.ts` consume from the actor:
 *
 *   - `ritualMastery` — the ritualist's Daemonic Mastery rating
 *     (core.md §"Daemonic Mastery"). Surfaces directly on the panel as
 *     the running tally and contributes to {@link resolveBreakingMastery}
 *     when this Heretic contests another's binding.
 *
 * Per-ritual selections — the chosen template, the operator-stacked
 * Table 6-7 modifiers, the rolled d100 result — are dialog-scoped and
 * never persisted to the DataModel; they live on the action-handler
 * path and the resulting chat card.
 *
 * Wiring is performed by the orchestrator (see `.integration-staging/179.json`):
 *   - spread `bcRitualSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `BcRitualDeclarations` to the class with a `declare` block
 *
 * Pure schema slot — no actor coupling, no Foundry side-effects beyond
 * the field constructors. Non-BC actors still get the field (default 0);
 * the panel and action are gated on `actor._gameSystemId === 'bc'` so the
 * surface is invisible elsewhere.
 */

const { NumberField } = foundry.data.fields;

/**
 * Class-level `declare` shape contributed by the BC Ritual schema slot.
 * The orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.ritualMastery` without casts.
 */
export interface BcRitualDeclarations {
    /** Daemonic Mastery rating (non-negative integer). */
    ritualMastery: number;
}

/**
 * Schema-field bundle for the BC Chaos Ritual engine. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...bcRitualSchemaFields(),
 *     };
 *
 * The single field has a safe initial of 0 so non-BC actors that happen
 * to be reflected over this schema still validate — the panel gate keeps
 * the value invisible to the player.
 */
export function bcRitualSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        ritualMastery: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            nullable: false,
        }),
    };
}
