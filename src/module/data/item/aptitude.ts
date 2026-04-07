import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Aptitude items.
 * Aptitudes are character building blocks that reduce XP costs.
 */
export default class AptitudeData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @override */
    static defineSchema() {
        return {
            ...super.defineSchema(),
            // No additional fields - aptitudes are just named references
        };
    }

    /** @override */
    get chatProperties() {
        return [];
    }

    /** @override */
    get headerLabels() {
        return [];
    }
}
