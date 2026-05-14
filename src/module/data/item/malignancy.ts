import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Malignancy items (corruption effects).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class MalignancyData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare effect: string;
    declare notes: string;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends `any`; the as-unknown chain satisfies DataField.Any brand without runtime effect
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),
        };
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        return [];
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels is a free-form record consumed by sheet templates
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {};
    }
}
