import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';
import { simpleEffectItemSchema } from '../shared/simple-effect-item.ts';

/**
 * Data model for Malignancy items (corruption effects).
 *
 * A "simple effect" item — its identifier / HTML field / notes schema is
 * shared with {@link ../item/special-ability.ts SpecialAbilityData} through
 * {@link simpleEffectItemSchema}; the only divergence is the HTML field name
 * (`effect` here, `benefit` there).
 *
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
        return {
            ...super.defineSchema(),
            ...simpleEffectItemSchema('effect'),
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
