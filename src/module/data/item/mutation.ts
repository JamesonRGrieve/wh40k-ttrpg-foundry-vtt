import { GIFT_ALIGNMENTS, GIFT_ROLL_DIRECTIONS, GIFT_SUB_TABLES, type GiftData } from '../../rules/bc-gifts.ts';
import { MUTATION_CATEGORIES, type MutationCategory } from '../../rules/mutation-categories.ts';
import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * The `system.gift` block: what a Black Crusade Gift of the Gods (#180) adds
 * on top of an ordinary mutation. Its shape is {@link GiftData}, declared once in
 * `rules/bc-gifts.ts`; every field defaults to empty, so a mutation that is not a
 * Gift (every Dark Heresy mutation) carries an inert block and loads unchanged.
 * Flat characteristic / skill changes are NOT here — they use the inherited
 * `modifiers` block (ModifiersTemplate, Path A) like every other item.
 */
function giftSchema(): foundry.data.fields.DataField.Any {
    const fields = foundry.data.fields;
    const uuidList = (): foundry.data.fields.DataField.Any =>
        new fields.ArrayField(new fields.StringField({ required: true, blank: false }), { required: true, initial: [] });
    return new fields.SchemaField({
        grants: uuidList(),
        riders: new fields.ArrayField(
            new fields.SchemaField({
                alignment: new fields.StringField({ required: true, initial: GIFT_ALIGNMENTS[0], choices: [...GIFT_ALIGNMENTS] }),
                description: new fields.HTMLField({ required: true, blank: true }),
                characteristics: new fields.ObjectField({ required: true, initial: {} }),
                skills: new fields.ObjectField({ required: true, initial: {} }),
                grants: uuidList(),
                activeEffect: new fields.StringField({ required: true, blank: true, initial: '' }),
            }),
            { required: true, initial: [] },
        ),
        subTable: new fields.StringField({ required: true, blank: true, initial: '', choices: [...GIFT_SUB_TABLES] }),
        characteristicRolls: new fields.ArrayField(
            new fields.SchemaField({
                characteristic: new fields.StringField({ required: true, blank: false }),
                formula: new fields.StringField({ required: true, blank: false }),
                direction: new fields.StringField({ required: true, initial: GIFT_ROLL_DIRECTIONS[0], choices: [...GIFT_ROLL_DIRECTIONS] }),
            }),
            { required: true, initial: [] },
        ),
    });
}

/**
 * Data model for Mutation items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class MutationData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: MutationCategory;
    declare effect: string;
    declare drawback: string;
    declare visible: boolean;
    declare notes: string;
    /** Gift of the Gods data (#180); empty on every non-Gift mutation. */
    declare gift: GiftData;

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // eslint-disable-next-line no-restricted-syntax -- boundary: IdentifierField extends `any`; the as-unknown chain satisfies DataField.Any brand without runtime effect
            identifier: new IdentifierField({ required: true, blank: true }) as unknown as foundry.data.fields.DataField.Any,

            // Mutation category (`gift` = a Black Crusade Gift of the Gods)
            category: new fields.StringField({
                required: true,
                initial: 'minor',
                choices: [...MUTATION_CATEGORIES],
            }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Drawbacks
            drawback: new fields.HTMLField({ required: false, blank: true }),

            // Is this visible to others?
            visible: new fields.BooleanField({ required: true, initial: true }),

            // Notes
            notes: new fields.StringField({ required: false, blank: true }),

            // Gift of the Gods riders / grants / sub-table / acquisition rolls (#180)
            gift: giftSchema(),
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
        return game.i18n.localize(`WH40K.MutationCategory.${this.category.capitalize()}`);
    }

    /* -------------------------------------------- */
    /*  Chat Properties                             */
    /* -------------------------------------------- */

    /** @override */
    get chatProperties(): string[] {
        const props = [this.categoryLabel];
        if (this.visible) props.push(game.i18n.localize('WH40K.Mutation.Visible'));
        return props;
    }

    /* -------------------------------------------- */
    /*  Header Labels                               */
    /* -------------------------------------------- */

    // eslint-disable-next-line no-restricted-syntax -- boundary: headerLabels is a free-form record consumed by sheet templates
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            category: this.categoryLabel,
        };
    }
}
