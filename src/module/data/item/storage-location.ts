import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Storage Location items.
 * These represent locations where items can be stored (ship cargo, safe house, etc.).
 */
export default class StorageLocationData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @foundry-v14-overrides.d.ts */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            location: new fields.StringField({ initial: '' }),
            isContainer: new fields.BooleanField({ initial: true }),
        };
    }

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        const props = [];
        // Cast 'this' to Record<string, unknown> to access properties not explicitly typed on the instance.
        // Assert 'location' to string, as defined in defineSchema.
        const location = (this as Record<string, unknown>).location as string;
        if (location) {
            props.push(location);
        }
        return props;
    }

    /** @foundry-v14-overrides.d.ts */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        // Cast 'this' to Record<string, unknown> to access properties not explicitly typed on the instance.
        // Assert 'location' to string, as defined in defineSchema.
        const location = (this as Record<string, unknown>).location as string;
        return [{ label: location || 'Storage', icon: 'fa-solid fa-warehouse' }];
    }

    /**
     * Container types this storage location accepts.
     * @returns {string[]}
     */
    static get containerTypes() {
        return ['ammunition', 'armour', 'armourModification', 'cybernetic', 'consumable', 'drug', 'forceField', 'gear', 'tool', 'weapon', 'weaponModification'];
    }
}
