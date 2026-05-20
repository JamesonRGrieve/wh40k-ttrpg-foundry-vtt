/**
 * Only War "Healing Comrades" + replacement-on-return-to-camp RAW
 * (#157 — core.md §"Healing Comrades" p.12269; replacement p.12261)
 * schema slot.
 *
 * Persistent state owned by this slot:
 *
 *   - `comradeRecoveryDays` — days of rest the Comrade still owes
 *     before auto-recovery completes. Starts at 0 (Comrade unharmed);
 *     the action layer raises this to {@link OW_COMRADE_AUTO_RECOVERY_DAYS}
 *     when the wound transition fires, then ticks it back down each
 *     downtime day or by Medicae-attempt DoS.
 *   - `refitAvailable` — whether the squad has refit logistics in
 *     reach to issue a replacement Comrade. The replacement action
 *     consults this gate before flipping a dead Comrade back to
 *     unharmed. Defaults to `false` so a fresh actor must be opted
 *     into refit by GM-toggle, Regiment Resource spend, or Munitorum
 *     supply.
 *
 * No actor coupling — the pure rules in
 * {@link ../../../rules/ow-comrade-healing} own the arithmetic and the
 * skip-reason taxonomy; this slot only persists the inputs/outputs.
 *
 * Fields stay safe to materialise on non-OW actors — they keep their
 * `initial` values and never render because the panel include is
 * gated on `isOW`.
 */

const { NumberField, BooleanField } = foundry.data.fields;

/**
 * Shape of the persisted Comrade-healing slot. Mirrors the schema
 * below exactly so the compiler narrows access without casts.
 */
export interface OwComradeHealingData {
    /** Days of recovery still owed before the Comrade is back to unharmed. */
    comradeRecoveryDays: number;
    /** Whether refit logistics currently allow a replacement Comrade. */
    refitAvailable: boolean;
}

/**
 * Class-level `declare` shape contributed by this schema slot. The
 * orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.comradeRecoveryDays` etc. without
 * casts.
 */
export interface OwComradeHealingDeclarations {
    comradeRecoveryDays: number;
    refitAvailable: boolean;
}

/**
 * Schema-field bundle for the Comrade-healing slot. Spread into a
 * DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owComradeHealingSchemaFields(),
 *     };
 *
 * Defaults: 0 days outstanding (Comrade not currently injured), refit
 * not yet authorised. The panel include is gated on `isOW`, so a
 * non-OW actor never sees these values.
 */
export function owComradeHealingSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        comradeRecoveryDays: new NumberField({
            required: true,
            initial: 0,
            min: 0,
            integer: true,
        }),
        refitAvailable: new BooleanField({ required: true, initial: false }),
    };
}
