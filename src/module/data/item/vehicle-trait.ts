import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import VehicleStatModifiersTemplate, { type VehicleStatModifiers } from '../shared/vehicle-stat-modifiers-template.ts';

/**
 * Data model for Vehicle Trait items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes VehicleStatModifiersTemplate
 */
export default class VehicleTraitData extends ItemDataModel.mixin(DescriptionTemplate, VehicleStatModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare descriptionText: string;
    // modifiers (vehicle-stat block + hasModifiers/modifiersList) from VehicleStatModifiersTemplate.
    declare modifiers: VehicleStatModifiers;
    declare hasLevel: boolean;
    declare level: number | null;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField brand mismatch with DataField.Any
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // Plain text description (for search/tooltips)
            descriptionText: new fields.StringField({ required: false, initial: '', blank: true }),

            // Stat modifiers (4-field block) come from VehicleStatModifiersTemplate.

            // Does this trait have a level?
            hasLevel: new fields.BooleanField({ required: true, initial: false }),
            level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    // hasModifiers / modifiersList are inherited from VehicleStatModifiersTemplate.

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName(): string {
        const parent = this.parent as { name?: string } | undefined;
        let name: string = parent?.name ?? '';
        if (this.hasLevel && this.level !== null) {
            name += ` ${this.level}`;
        }
        return name;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props: string[] = [];
        if (this.hasLevel && this.level !== null) {
            props.push(`Level: ${this.level}`);
        }
        if (this.hasModifiers) {
            for (const mod of this.modifiersList) {
                props.push(`${mod.label}: ${mod.formatted}`);
            }
        }
        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    // eslint-disable-next-line no-restricted-syntax -- boundary: ItemDataModel.headerLabels typed loosely across item types
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }
}
