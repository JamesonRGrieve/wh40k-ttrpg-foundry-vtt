import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

/**
 * Data model for Backpack/Container items.
 * These are storage containers that can hold other items.
 */
export default class BackpackData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate) {
    // Typed property declarations matching defineSchema()
    declare capacity: number;
    declare isCombatVest: boolean;

    /** @override */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            capacity: new fields.NumberField({ initial: 30, min: 0 }),
            isCombatVest: new fields.BooleanField({ initial: false }),
        };
    }

    /** @override */
    get chatProperties(): string[] {
        const props = [];
        props.push(`Capacity: ${this.capacity} kg`);
        if (this.isCombatVest) {
            props.push('Combat Vest');
        }
        if (this.availability) {
            props.push(CONFIG.wh40k?.availabilities?.[this.availability] ?? this.availability);
        }
        return props;
    }

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return [{ label: `${this.capacity} kg`, icon: 'fa-solid fa-weight-hanging' }];
    }
}
