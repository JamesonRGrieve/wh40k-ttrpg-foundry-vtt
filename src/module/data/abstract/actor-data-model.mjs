import SystemDataModel from "./system-data-model.mjs";

/**
 * Base data model for all Actor types in Rogue Trader.
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
    static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
        supportsAdvancement: false,
    }, { inplace: false }));

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /** @override */
    get embeddedDescriptionKeyPath() {
        return "bio.notes";
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritdoc */
    static defineSchema() {
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
    prepareEmbeddedData() {}

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
    getRollData({ deterministic = false } = {}) {
        const data = { ...this };
        return data;
    }
}
