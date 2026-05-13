import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Storage Location items.
 * These represent locations where items can be stored (ship cargo, safe house, etc.).
 */
export default class StorageLocationData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare location: string;
    declare isContainer: boolean;

    /** @override */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            location: new fields.StringField({ initial: '' }),
            isContainer: new fields.BooleanField({ initial: true }),
        };
    }

    /** @override */
    get chatProperties(): string[] {
        const props = [];
        if (this.location) {
            props.push(this.location);
        }
        return props;
    }

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return [{ label: this.location || 'Storage', icon: 'fa-solid fa-warehouse' }];
    }

    /**
     * Container types this storage location accepts.
     * @returns {string[]}
     */
    static get containerTypes(): string[] {
        return ['ammunition', 'armour', 'armourModification', 'cybernetic', 'consumable', 'drug', 'forceField', 'gear', 'tool', 'weapon', 'weaponModification'];
    }
}
