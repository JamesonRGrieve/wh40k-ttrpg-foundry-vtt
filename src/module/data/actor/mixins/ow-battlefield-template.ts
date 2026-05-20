/**
 * Only War · Battlefield Awareness & Manoeuvres persistence slot
 * (#161 — core.md §"BATTLEFIELD AWARENESS AND MANOEUVRES" line 13361,
 * §"Support" line 13411; §"CREATING REGIMENTAL AWARDS" line 13103).
 *
 * Two engines fold into one actor-level mixin because they share the
 * Battlefield panel and chat surface: the Support Asset Request loop
 * (`src/module/rules/ow-battlefield-support.ts`) needs a per-actor
 * cooldown counter, and the Regimental Award catalogue
 * (`src/module/rules/ow-regimental-award.ts`) needs the list of award
 * ids currently conferred on the Guardsman so the panel can merge their
 * bonuses for display.
 *
 * Persistent state owned by this slot:
 *
 *   - `supportCooldown`  — turns remaining before the squad may request
 *                          another off-table support asset. Starts at 0
 *                          (no cooldown active); the action layer sets
 *                          this from `requestSupport().turnsUntilArrival`
 *                          plus the asset's `cooldownTurns` on a
 *                          successful call, then ticks it back down via
 *                          `applySupportCooldown` at turn-end.
 *   - `regimentalAwards` — ordered list of canonical Award identifiers
 *                          (compendium ids or slugs) currently conferred
 *                          on the actor. The panel resolves these to
 *                          full `RegimentalAward` records at render time
 *                          via the compendium-driven `uuidNameCache` and
 *                          feeds them to `mergeRegimentalAwards` for the
 *                          merged-bonus readout.
 *
 * No actor coupling — the pure rules in
 * {@link ../../../rules/ow-battlefield-support} and
 * {@link ../../../rules/ow-regimental-award} own all arithmetic; this
 * slot only persists the inputs/outputs.
 *
 * Fields stay safe to materialise on non-OW actors — they keep their
 * `initial` values and never render because the panel include is gated
 * on `isOW`.
 */

const { NumberField, ArrayField, StringField } = foundry.data.fields;

/**
 * Shape of the persisted Battlefield slot. Mirrors the schema below
 * exactly so the compiler narrows access without casts.
 */
export interface OwBattlefieldData {
    /** Turns remaining before the squad may request support again. */
    supportCooldown: number;
    /** Identifiers of Regimental Awards currently conferred on the actor. */
    regimentalAwards: string[];
}

/**
 * Class-level `declare` shape contributed by this schema slot. The
 * orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.supportCooldown` and
 * `actor.system.regimentalAwards` without casts.
 */
export interface OwBattlefieldDeclarations {
    supportCooldown: number;
    regimentalAwards: string[];
}

/**
 * Schema-field bundle for the Battlefield slot. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owBattlefieldSchemaFields(),
 *     };
 *
 * Defaults: 0 cooldown turns (asset immediately requestable), empty
 * award roster. The panel include is gated on `isOW`, so a non-OW actor
 * never surfaces these values.
 */
export function owBattlefieldSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        supportCooldown: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
        }),
        regimentalAwards: new ArrayField(new StringField({ required: true, blank: false }), {
            required: true,
            initial: [],
        }),
    };
}
