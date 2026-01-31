import SystemDataModel from "./system-data-model.mjs";

/**
 * Base data model for all Actor types in Rogue Trader.
 * Provides shared functionality and schema patterns for actors.
 */
export default class ActorDataModel extends SystemDataModel {
    /** @type {ActorDataModelMetadata} */
    static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {}, { inplace: false }));


    /* -------------------------------------------- */
    /*  Data Model Configuration                    */
    /* -------------------------------------------- */

    /**
     * @inheritdoc
     */
    static defineSchema() {
        return {
            ...super.defineSchema(),
        };
    }
    
    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /**
     * Generate base roll data for this actor.
     * @returns {object}
     */
    getRollData() {
        const data = { ...this };
        return data;
    }

}
