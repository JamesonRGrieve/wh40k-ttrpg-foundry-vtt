/**
 * Black Crusade Supplement Mechanics DataModel mixin (#181).
 *
 * Persists the per-actor state for the umbrella resolver in
 * `src/module/rules/bc-supplement-mechanics.ts`:
 *
 *   - `daemonEngineRating`     — the X value of the Daemon Engine(X) trait
 *                                (decay.md :1379-1391). 0 means "not a
 *                                Daemon Engine" — the rage bonus surface
 *                                is hidden. Non-zero values drive
 *                                {@link daemonEngineRageBonus} along with
 *                                the dialog/encounter-scoped
 *                                `turnsSinceLastDamage`.
 *   - `quickAndTheDeadActive`  — Tzeentch-touched initiative perk
 *                                (fate.md :669). When true, the panel
 *                                folds the per-alignment bonus from
 *                                {@link QUICK_AND_THE_DEAD_BONUS_BY_ALIGNMENT}
 *                                into the actor's initiative readout.
 *
 * Per the brief, Legacy Weapon state (kills / tier) lives on weapon items
 * and is out of scope here — the actor-level mixin only carries the two
 * fields above. Irradiated(X) likewise lives on the target's per-effect
 * state, not the actor schema.
 *
 * Wiring is performed by the orchestrator (see `.integration-staging/181.json`):
 *   - spread `bcSupplementsSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `BcSupplementsDeclarations` to the class with a `declare` block
 *
 * Pure schema slot — no actor coupling, no Foundry side-effects beyond
 * the field constructors. Non-BC actors still get the fields (defaults
 * of 0 / false); the panel and action are gated on
 * `actor._gameSystemId === 'bc'` so the surface is invisible elsewhere.
 */

const { NumberField, BooleanField } = foundry.data.fields;

/**
 * Class-level `declare` shape contributed by the BC Supplements schema
 * slot. The orchestrator splices these declarations onto CharacterData so
 * the compiler narrows `actor.system.daemonEngineRating` etc. without
 * casts.
 */
export interface BcSupplementsDeclarations {
    /**
     * Daemon Engine(X) rating. 0 = not a Daemon Engine; positive integers
     * are the X value used by {@link daemonEngineRageBonus}.
     */
    daemonEngineRating: number;
    /**
     * Whether the actor has the Quick and the Dead trait active. When
     * true the panel surfaces the per-alignment initiative bonus.
     */
    quickAndTheDeadActive: boolean;
}

/**
 * Schema-field bundle for the BC Supplement Mechanics engine. Spread
 * into a DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...bcSupplementsSchemaFields(),
 *     };
 *
 * Every field has a safe initial so non-BC actors that happen to be
 * reflected over this schema still validate — the panel gate keeps the
 * values invisible to the player.
 */
export function bcSupplementsSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        daemonEngineRating: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
            nullable: false,
        }),
        quickAndTheDeadActive: new BooleanField({
            required: true,
            initial: false,
            nullable: false,
        }),
    };
}
