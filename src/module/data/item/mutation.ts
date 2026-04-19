import ItemDataModel from '../abstract/item-data-model.ts';
import IdentifierField from '../fields/identifier-field.ts';
import DescriptionTemplate from '../shared/description-template.ts';
import ModifiersTemplate from '../shared/modifiers-template.ts';

/**
 * Data model for Mutation items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class MutationData extends ItemDataModel.mixin(DescriptionTemplate, ModifiersTemplate) {
    // Typed property declarations matching defineSchema()
    declare identifier: string;
    declare category: string;
    declare effect: string;
    declare drawback: string;
    declare visible: boolean;
    declare notes: string;

    /** @inheritdoc */
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),

            // @ts-expect-error - argument count
            identifier: new IdentifierField({ required: true, blank: true }),

            // Mutation category
            category: new fields.StringField({
                required: true,
                initial: 'minor',
                choices: ['minor', 'major', 'malignancy'],
            }),

            // Effect description
            effect: new fields.HTMLField({ required: true, blank: true }),

            // Drawbacks
            drawback: new fields.HTMLField({ required: false, blank: true }),

            // Is this visible to others?
            visible: new fields.BooleanField({ required: true, initial: true }),

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

    /** @override */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {
            category: this.categoryLabel,
        };
    }
}
