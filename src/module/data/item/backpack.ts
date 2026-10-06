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

    // Properties from PhysicalItemTemplate
    declare availability: string;
    declare readonly availabilityLabel: string;

    /** @override */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            capacity: new fields.NumberField({ initial: 30, min: 0 }),
            isCombatVest: new fields.BooleanField({ initial: false }),
        };
    }

    /** @override */
    get chatProperties(): string[] {
        const props: string[] = [];
        props.push(game.i18n.format('WH40K.Backpack.CapacityProperty', { capacity: String(this.capacity) }));
        if (this.isCombatVest) {
            props.push(game.i18n.localize('WH40K.Backpack.CombatVestProperty'));
        }
        // The shared label: the printed restriction words, else the localized rarity.
        if (this.availability !== '') props.push(this.availabilityLabel);
        return props;
    }

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return [{ label: `${this.capacity} kg`, icon: 'fa-solid fa-weight-hanging' }];
    }
}
