import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Mental Disorder items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class MentalDisorderData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare severity: string;
    declare trigger: string;
    declare effect: string;
    declare treatment: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            identifier: new IdentifierField({ required: true, blank: true }),

            // Severity
            severity: new fields.StringField({
                required: true,
                initial: 'minor',
                choices: ['minor', 'severe', 'acute'],
            }),

            // Trigger conditions
            trigger: new fields.HTMLField({ required: false, blank: true }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Treatment description
            treatment: new fields.HTMLField({ required: false, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * Get the severity label.
     * @type {string}
     */
    get severityLabel(): string {
        return game.i18n.localize(`WH40K.MentalDisorder.${this.severity.capitalize()}`);
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        return [this.severityLabel];
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            severity: this.severityLabel,
        };
    }
}
