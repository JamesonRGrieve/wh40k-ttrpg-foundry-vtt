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
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends StringField but TS can't verify the mixin constraint without casting
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

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
    get fullName(): string {
        const parentItem = this.parent as { name?: string } | undefined;
        let name = parentItem?.name ?? '';
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels return type mirrors base ItemDataModel schema
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }
}
