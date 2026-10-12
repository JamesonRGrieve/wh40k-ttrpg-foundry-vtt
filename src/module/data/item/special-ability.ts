import type { SpecialAbilityDistinctionFields } from '../../rules/dw-distinction.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';
import { simpleEffectItemSchema } from '../shared/simple-effect-item.ts';
import { specialAbilityDistinctionSchema } from './special-ability-fields.ts';

/**
 * Data model for Special Ability items.
 *
 * A "simple effect" item — its identifier / HTML field / notes schema is
 * shared with {@link ../item/malignancy.ts MalignancyData} through
 * {@link simpleEffectItemSchema}; the only divergence is the HTML field name
 * (`benefit` here, `effect` there).
 *
 * Special abilities additionally carry the Deathwatch Distinction fields
 * (#171): a `category` (speciality / advanced / distinction / mark), a
 * Renown gate and reward, an XP cost, the Marks a Distinction combines and
 * a Mark's grant. They live in {@link specialAbilityDistinctionSchema}, not
 * the shared fragment, so malignancies never carry them.
 *
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class SpecialAbilityData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare benefit: string;
    declare notes: string;
    declare category: SpecialAbilityDistinctionFields['category'];
    declare renownRequired: SpecialAbilityDistinctionFields['renownRequired'];
    declare renownReward: SpecialAbilityDistinctionFields['renownReward'];
    declare cost: SpecialAbilityDistinctionFields['cost'];
    declare marks: SpecialAbilityDistinctionFields['marks'];
    declare grant: SpecialAbilityDistinctionFields['grant'];

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        return {
            ...super.defineSchema(),
            ...simpleEffectItemSchema('benefit'),
            ...specialAbilityDistinctionSchema(),
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
