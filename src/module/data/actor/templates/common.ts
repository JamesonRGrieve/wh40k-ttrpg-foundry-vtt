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
        return this.mergeSchema(super.defineSchema(), {
            // Truly shared schema elements go here
            // Currently empty - creature-specific data stays in CreatureTemplate
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
