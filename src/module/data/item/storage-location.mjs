import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";

/**
 * Data model for Storage Location items.
 * These represent locations where items can be stored (ship cargo, safe house, etc.).
 */
export default class StorageLocationData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @override */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            location: new fields.StringField({ initial: "" }),
            isContainer: new fields.BooleanField({ initial: true })
        };
    }

    /** @override */
    get chatProperties() {
        const props = [];
        if (this.location) {
            props.push(this.location);
        }
        return props;
    }

    /** @override */
    get headerLabels() {
        return [
            { label: this.location || "Storage", icon: "fa-solid fa-warehouse" }
        ];
    }

    /**
     * Container types this storage location accepts.
     * @returns {string[]}
     */
    static get containerTypes() {
        return [
            "ammunition",
            "armour",
            "armourModification",
            "cybernetic",
            "consumable",
            "drug",
            "forceField",
            "gear",
            "tool",
            "weapon",
            "weaponModification"
        ];
    }
}
