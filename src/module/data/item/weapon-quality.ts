import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';

/**
 * Data model for Weapon Quality items (reference items for weapon qualities).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class WeaponQualityData extends ItemDataModel.mixin(DescriptionTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare hasLevel: boolean;
    declare level: number | null;
    declare effect: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Does this quality have a level/rating?
            hasLevel: new fields.BooleanField({ required: true, initial: false }),
            level: new fields.NumberField({ required: false, initial: null, min: 0, integer: true }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName() {
        let name = this.parent?.name ?? '';
        if (this.hasLevel && this.level !== null) {
            name += ` (${this.level})`;
        }
        return name;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [];
        if (this.hasLevel && this.level !== null) {
            props.push(`Level: ${this.level}`);
        }
        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }
}
