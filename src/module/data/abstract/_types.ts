/**
 * Type definitions for WH40K RPG abstract data models.
 */

/**
 * Metadata for SystemDataModel.
 */
export interface SystemDataModelMetadata {
    systemFlagsModel: typeof foundry.abstract.DataModel | null;
}

/**
 * Metadata for ItemDataModel.
 */
export interface ItemDataModelMetadata extends SystemDataModelMetadata {
    enchantable: boolean;
    hasEffects: boolean;
    singleton: boolean;
}

/**
 * Metadata for ActorDataModel.
 */
export interface ActorDataModelMetadata extends SystemDataModelMetadata {
    supportsAdvancement: boolean;
}
