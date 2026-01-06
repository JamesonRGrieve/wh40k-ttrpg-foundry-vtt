import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Mutation items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class MutationData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Mutation category
      category: new fields.StringField({
        required: true,
        initial: "minor",
        choices: ["minor", "major", "malignancy"]
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Drawbacks
      drawback: new fields.HTMLField({ required: false, blank: true }),
      
      // Is this visible to others?
      visible: new fields.BooleanField({ required: true, initial: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the category label.
   * @type {string}
   */
  get categoryLabel() {
    return game.i18n.localize(`RT.MutationCategory.${this.category.capitalize()}`);
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [this.categoryLabel];
    if ( this.visible ) props.push(game.i18n.localize("RT.Mutation.Visible"));
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      category: this.categoryLabel
    };
  }
}
