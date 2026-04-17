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
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        return (this as any).mergeSchema(super.defineSchema(), {
            // Truly shared schema elements go here
            // Currently empty - creature-specific data stays in CreatureTemplate
        });
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static _migrateData(source: Record<string, unknown>): void {
        // @ts-expect-error - DataModel lifecycle method
        super._migrateData?.(source);
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    static _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown> = {}): void {
        // @ts-expect-error - DataModel lifecycle method
        super._cleanData?.(source, options);
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritDoc */
    prepareBaseData(): void {
        // @ts-expect-error - DataModel lifecycle method
        super.prepareBaseData?.();
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    prepareDerivedData(): void {
        // @ts-expect-error - DataModel lifecycle method
        super.prepareDerivedData?.();
    }
}
