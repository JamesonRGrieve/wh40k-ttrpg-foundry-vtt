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
    // Added declaration for 'availability' to resolve TS2339 errors
    declare availability: string;

    /** @foundry-v14-overrides.d.ts */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            capacity: new fields.NumberField({ initial: 30, min: 0 }),
            isCombatVest: new fields.BooleanField({ initial: false }),
        };
    }

    /** @foundry-v14-overrides.d.ts */
    get chatProperties(): string[] {
        const props = [];
        props.push(`Capacity: ${this.capacity} kg`);
        if (this.isCombatVest) {
            props.push('Combat Vest');
        }
        // Check if 'availability' exists before pushing to props to avoid errors if it's undefined
        if (this.availability) {
            // Use `CONFIG as Record<string, any>` to safely access potentially untyped Foundry CONFIG properties.
            // Use nullish coalescing operator `??` to fall back to the raw availability string if the lookup fails.
            const availabilityDisplay = (CONFIG as Record<string, any>)?.wh40k?.availabilities?.[this.availability] ?? this.availability;
            props.push(availabilityDisplay);
        }
        return props;
    }

    /** @foundry-v14-overrides.d.ts */
    // The TypeScript error indicated a type mismatch where string[] was expected.
    // Adjusted the return type and the returned value to conform to string[].
    get headerLabels(): string[] {
        // Original return value: [{ label: `${this.capacity} kg`, icon: 'fa-solid fa-weight-hanging' }];
        // This structure was causing TS2322: Type '(string | LabelModifierConfig)[]' is not assignable to type 'string[]'.
        // By returning only the capacity as a string, we satisfy the string[] type requirement.
        return [`${this.capacity} kg`];
    }
}
