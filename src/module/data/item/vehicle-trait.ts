import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import IdentifierField from '../fields/identifier-field.ts';

/**
 * Data model for Vehicle Trait items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
// @ts-expect-error - TS2417 static side inheritance
export default class VehicleTraitData extends ItemDataModel.mixin(DescriptionTemplate) {
    /** @inheritdoc */
    static defineSchema() {
        const fields = (foundry.data as any).fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Plain text description (for search/tooltips)
            descriptionText: new fields.StringField({ required: false, initial: '', blank: true }),

            // Stat modifiers (CRITICAL - applies to vehicle!)
            modifiers: new fields.SchemaField({
                speed: new fields.NumberField({ required: true, initial: 0, integer: true }),
                manoeuvrability: new fields.NumberField({ required: true, initial: 0, integer: true }),
                armour: new fields.NumberField({ required: true, initial: 0, integer: true }),
                integrity: new fields.NumberField({ required: true, initial: 0, integer: true }),
            }),

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

    /**
     * Has any non-zero modifiers?
     * @type {boolean}
     */
    get hasModifiers() {
        return Object.values(this.modifiers).some((v) => v !== 0);
    }

    /**
     * Get modifiers as a formatted list.
     * @type {object[]}
     */
    get modifiersList() {
        const list = [];
        for (const [key, value] of Object.entries(this.modifiers)) {
            if (value !== 0) {
                const label = game.i18n.localize(`WH40K.VehicleStat.${key.charAt(0).toUpperCase()}${key.slice(1)}`);
                list.push({
                    key,
                    label,
                    value,
                    // @ts-expect-error - operator type
                    formatted: `${value >= 0 ? '+' : ''}${value}`,
                });
            }
        }
        return list;
    }

    /**
     * Get the full name including level.
     * @type {string}
     */
    get fullName() {
        let name = this.parent?.name ?? '';
        if (this.hasLevel && this.level !== null) {
            name += ` ${this.level}`;
        }
        return name;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties() {
        const props = [];
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
    get headerLabels() {
        return {
            level: this.hasLevel ? this.level : '-',
        };
    }
}
