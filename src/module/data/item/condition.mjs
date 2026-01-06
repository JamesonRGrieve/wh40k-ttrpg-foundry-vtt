import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Condition items (status effects).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class ConditionData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Is this a beneficial or harmful condition?
      nature: new fields.StringField({
        required: true,
        initial: "harmful",
        choices: ["beneficial", "harmful", "neutral"]
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // How to remove the condition
      removal: new fields.HTMLField({ required: false, blank: true }),
      
      // Is this stackable?
      stackable: new fields.BooleanField({ required: true, initial: false }),
      stacks: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the nature label.
   * @type {string}
   */
  get natureLabel() {
    return game.i18n.localize(`RT.Condition.${this.nature.capitalize()}`);
  }

  /**
   * Get the full name with stacks.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.stackable && this.stacks > 1 ) {
      name += ` (${this.stacks})`;
    }
    return name;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [this.natureLabel];
    if ( this.stackable ) {
      props.push(`Stacks: ${this.stacks}`);
    }
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      nature: this.natureLabel,
      stacks: this.stackable ? this.stacks : "-"
    };
  }
}
