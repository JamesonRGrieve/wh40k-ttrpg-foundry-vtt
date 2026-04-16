import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import EquippableTemplate from '../shared/equippable-template.ts';
import PhysicalItemTemplate from '../shared/physical-item-template.ts';

/**
 * Data model for Gear items (general equipment).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 */
export default class GearData extends ItemDataModel.mixin(DescriptionTemplate, PhysicalItemTemplate, EquippableTemplate) {
    [key: string]: any;

    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: string;
    declare consumable: boolean;
    declare uses: { value: number; max: number };
    declare effect: string;
    declare duration: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = (foundry.data as any).fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Gear category
            category: new fields.StringField({
                required: true,
                initial: 'general',
                choices: [
                    'general',
                    'tools',
                    'drugs',
                    'consumable',
                    'clothing',
                    'survival',
                    'communications',
                    'detection',
                    'medical',
                    'tech',
                    'religious',
                    'luxury',
                    'contraband',
                ],
            }),

            // Is this consumable?
            consumable: new fields.BooleanField({ required: true, initial: false }),

            // Uses/charges (for consumables)
            uses: new fields.SchemaField({
                value: new fields.NumberField({ required: false, initial: null, min: 0 }),
                max: new fields.NumberField({ required: false, initial: null, min: 0 }),
            }),

            // Effect when used
            effect: new fields.HTMLField({ required: false, blank: true }),

            // Duration of effect (for drugs, etc.)
            duration: new fields.StringField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the category label.
     * @type {string}
     */
    get categoryLabel(): string {
        return game.i18n.localize(`WH40K.GearCategory.${this.category.capitalize()}`);
    }

    /**
     * Does this item have limited uses?
     * @type {boolean}
     */
    get hasLimitedUses() {
        return this.uses.max !== null && this.uses.max > 0;
    }

    /**
     * Are uses exhausted?
     * @type {boolean}
     */
    get usesExhausted() {
        return this.hasLimitedUses && this.uses.value <= 0;
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        // @ts-expect-error - TS2339
        const props = [...PhysicalItemTemplate.prototype.chatProperties.call(this), this.categoryLabel];

        if (this.hasLimitedUses) {
            props.push(`Uses: ${this.uses.value}/${this.uses.max}`);
        }

        if (this.duration) {
            props.push(`Duration: ${this.duration}`);
        }

        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            category: this.categoryLabel,
        };
    }

    /* -------------------------------------------- */
    /*  Actions                                     */
    /* -------------------------------------------- */

    /**
     * Consume one use.
     * @returns {Promise<Item>}
     */
    consume(): any {
        if (!this.hasLimitedUses) return this.parent;
        const newValue = Math.max(0, (this.uses.value ?? 0) - 1);
        return this.parent?.update({ 'system.uses.value': newValue });
    }
}
