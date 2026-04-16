import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Special Ability items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class SpecialAbilityData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    [key: string]: any;

    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare benefit: string;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = (foundry.data as any).fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Benefit/effect description
            benefit: new fields.HTMLField({ required: true, blank: true }),

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

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {};
    }
}
