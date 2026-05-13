import SystemDataModel from './system-data-model.ts';

/**
 * Base data model for all Actor types in WH40K RPG.
 * Provides shared functionality and schema patterns for actors.
 *
 * Key features:
 * - metadata for actor type configuration
 * - prepareEmbeddedData() hook for item-dependent calculations
 * - getRollData() base for dice roll commands
 */
export default class ActorDataModel extends SystemDataModel {
    /**
     * Actor-specific metadata.
     * @type {ActorDataModelMetadata}
     */
    static override metadata: Record<string, unknown> = Object.freeze(
        foundry.utils.mergeObject(
            super.metadata,
            {
                supportsAdvancement: false,
            },
            { inplace: false },
        ),
    );

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    override get embeddedDescriptionKeyPath(): string {
        return 'bio.notes';
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        return this.mergeSchema(super.defineSchema(), {});
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * Data preparation steps to perform after item data has been prepared,
     * but before active effects are applied.
     *
     * Override in subclasses to prepare data that depends on embedded items.
     */
    prepareEmbeddedData(): void {}

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /**
     * Prepare a data object which defines the data schema used by dice roll commands against this Actor.
     * @param {object} [options]
     * @param {boolean} [options.deterministic]  Whether to force deterministic values for data properties
     *                                           that could be either a die term or a flat term.
     * @returns {object}
     */
    getRollData({ deterministic: _deterministic = false } = {}): Record<string, unknown> {
        const data: Record<string, unknown> = { ...(this as unknown as Record<string, unknown>) };
        return data;
    }
}
