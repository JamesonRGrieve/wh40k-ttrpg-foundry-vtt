/**
 * Black Crusade Gifts of the Gods DataModel mixin (#180).
 *
 * Persists the minimum state the pure resolver in
 * `src/module/rules/bc-gifts.ts` reads:
 *
 *   - `gifts` — ordered list of gift identifiers (typically the compendium
 *               document id, stable across renames). The resolver merges
 *               each gift's base effect with the rider matching the
 *               actor's current Chaos Alignment at render time; the panel
 *               surfaces the merged characteristic-delta summary.
 *
 * Per Direction #7 of CLAUDE.md, the gift catalogue itself — names,
 * descriptions, riders, characteristic deltas — lives in compendium
 * `_source/*.json` documents and is resolved through `uuidNameCache`.
 * This mixin owns only the per-actor selection (which gifts are held).
 *
 * Wiring is performed by the orchestrator (see `.integration-staging/180.json`):
 *   - spread `bcGiftsSchemaFields()` into `CharacterData.defineSchema()`
 *   - apply `BcGiftsDeclarations` to the class with a `declare` block
 *
 * Pure schema slot — no actor coupling, no Foundry side-effects beyond
 * the field constructors. Non-BC actors still get the field (default
 * empty array); the panel is gated on `actor._gameSystemId === 'bc'` so
 * the surface is invisible elsewhere.
 */

const { ArrayField, StringField } = foundry.data.fields;

/**
 * Class-level `declare` shape contributed by the BC Gifts schema slot.
 * The orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.gifts` without casts.
 */
export interface BcGiftsDeclarations {
    /** Ordered list of gift identifiers held by the actor. */
    gifts: string[];
}

/**
 * Schema-field bundle for the BC Gifts of the Gods engine. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...bcGiftsSchemaFields(),
 *     };
 *
 * The default is an empty array so non-BC actors that happen to be
 * reflected over this schema still validate; the panel gate keeps the
 * field invisible to the player.
 */
export function bcGiftsSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        gifts: new ArrayField(
            new StringField({
                required: true,
                blank: false,
            }),
            {
                required: true,
                initial: [],
            },
        ),
    };
}
