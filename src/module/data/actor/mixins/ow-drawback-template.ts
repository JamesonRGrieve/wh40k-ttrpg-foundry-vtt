/**
 * Only War · Regimental Drawbacks + Multiple Comrades roster
 * persistence slot (#160 — hammer.md §"REGIMENTAL DRAWBACKS" line 1150,
 * §"MIXED REGIMENTS" line 1311, §"Comrade Advances / Multiple Comrades"
 * lines 1677, 1713).
 *
 * Two pieces of state owned by this slot:
 *
 *   - `regimentDrawbacks` — the ids of the Regimental Drawbacks the
 *     player has currently selected. Each id resolves to a
 *     {@link RegimentDrawback} descriptor on a compendium document; the
 *     engine layer (`ow-regiment-drawback.ts`) walks the list to compute
 *     the refunded budget and the merged penalty grants. Ids are stored
 *     as bare strings (Foundry UUIDs in practice) so the slot remains
 *     content-agnostic per Direction #7.
 *
 *   - `multiComradeRoster` — the optional Multiple Comrades roster.
 *     RAW each PC has exactly one Comrade and this slot is `null`;
 *     Comrade Advances grant additional Comrades that the engine's
 *     {@link MultiComradeRoster} shape tracks. `nullable: true, initial:
 *     null` lets us distinguish "single-Comrade RAW default" (null) from
 *     "explicit roster" (populated object) without coupling to a sentinel
 *     value.
 *
 * No actor coupling — the pure rules in
 * {@link ../../../rules/ow-regiment-drawback} own the arithmetic; this
 * slot only persists the selection inputs.
 *
 * Fields stay safe to materialise on non-OW actors — they keep their
 * `initial` values (empty array / null) and never render because the
 * panel include is gated on `isOW`.
 */

const { ArrayField, SchemaField, StringField } = foundry.data.fields;

/**
 * Persisted roster shape. Mirrors {@link MultiComradeRoster} from the
 * engine module: a non-empty `primaryId` plus zero-or-more additional
 * Comrade ids in acquisition order. When the slot is `null` the actor
 * is treated as carrying their RAW single Comrade (held in the #152
 * `comrade` slot owned by `ow-comrade-template.ts`); the engine roster
 * helpers only run when this slot is populated.
 */
export interface OwMultiComradeRosterData {
    primaryId: string;
    additionalIds: string[];
}

/**
 * Class-level `declare` shape contributed by this schema slot. The
 * orchestrator splices these declarations onto CharacterData so the
 * compiler narrows `actor.system.regimentDrawbacks` and
 * `actor.system.multiComradeRoster` without casts.
 */
export interface OwDrawbackDeclarations {
    /** Selected Regimental Drawback ids (compendium UUIDs). */
    regimentDrawbacks: string[];
    /**
     * Optional Multiple Comrades roster. `null` = RAW single-Comrade
     * default (the canonical Comrade lives in `system.comrade`).
     */
    multiComradeRoster: OwMultiComradeRosterData | null;
}

/**
 * Schema-field bundle for the OW Drawback + Multiple Comrades slot.
 * Spread into a DataModel's `defineSchema()` return value:
 *
 *     return {
 *         ...super.defineSchema(),
 *         ...owDrawbackSchemaFields(),
 *     };
 *
 * Defaults: empty drawback list, no multi-Comrade roster. The panel
 * include is gated on `isOW`, so a non-OW actor never renders these
 * values even though they are materialised on the schema.
 */
export function owDrawbackSchemaFields(): Record<string, foundry.data.fields.DataField.Any> {
    return {
        regimentDrawbacks: new ArrayField(new StringField({ required: true, blank: false, nullable: false }), {
            required: true,
            initial: [],
        }),
        multiComradeRoster: new SchemaField(
            {
                primaryId: new StringField({ required: true, initial: '', nullable: false }),
                additionalIds: new ArrayField(new StringField({ required: true, blank: false, nullable: false }), {
                    required: true,
                    initial: [],
                }),
            },
            { required: false, nullable: true, initial: null },
        ),
    };
}
