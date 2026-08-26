import ActorDataModel from '../../abstract/actor-data-model.ts';

/**
 * Common template for ALL actor types in WH40K RPG.
 *
 * This template contains ONLY utilities that are truly shared across ALL actor types,
 * including creatures, vehicles, and starships.
 *
 * **What belongs here:**
 * - Shared utility methods (e.g., common calculations, helpers)
 * - Base migration helpers that apply to all actors
 * - Common metadata or configuration
 *
 * **What does NOT belong here:**
 * - Characteristics, wounds, movement (creature-specific → CreatureTemplate)
 * - Skills, fate, psy (creature-specific → CreatureTemplate)
 * - Vehicle-specific systems (→ VehicleData)
 * - Starship-specific systems (→ StarshipData)
 *
 * @extends {ActorDataModel}
 */
export default class CommonTemplate extends ActorDataModel {
    /* -------------------------------------------- */
    /*  Model Configuration                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const { ArrayField, NumberField, SchemaField, StringField } = foundry.data.fields;
        return this.mergeSchema(super.defineSchema(), {
            // Portrait pool (#567): extra portrait variants beyond the actor's
            // default `img`. Authored in the compendium _source; on spawn one is
            // chosen (at random, or the `pinned` one) and stamped onto the
            // created actor's img + token-bust frame. Each variant carries its
            // own tokenFrame because the circular bust is cropped from the
            // portrait per-image. Shared across ALL actor types and all 7 systems.
            portraits: new SchemaField({
                variants: new ArrayField(
                    new SchemaField({
                        img: new StringField({ required: true, blank: false }),
                        tokenFrame: new SchemaField({
                            cx: new NumberField({ required: false, nullable: true, min: 0, max: 1, initial: null }),
                            cy: new NumberField({ required: false, nullable: true, min: 0, max: 1, initial: null }),
                            zoom: new NumberField({ required: false, nullable: true, min: 0, initial: null }),
                        }),
                    }),
                    { required: false, initial: [] },
                ),
                // Pin a specific index in the effective pool (0 = the default
                // img); null pins nothing, so spawn picks at random.
                pinned: new NumberField({ required: false, nullable: true, integer: true, min: 0, initial: null }),
            }),
        });
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry migration source data
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        // Add shared migrations here that apply to ALL actor types
        // Coerce legacy game-system identifiers (dh2e/dh1e) to the canonical
        // short keys so actors saved under the old ids validate against the
        // renamed schema on load, before the world-version migration runs.
        if (source['gameSystem'] === 'dh2e') source['gameSystem'] = 'dh2';
        else if (source['gameSystem'] === 'dh1e') source['gameSystem'] = 'dh1';
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry _cleanData source data
    static override _cleanData(source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
        // Add shared cleaning here that applies to ALL actor types
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    override prepareBaseData(): void {
        super.prepareBaseData();
        // Add shared base data prep that applies to ALL actor types
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
        // Add shared derived data prep that applies to ALL actor types
    }
}
