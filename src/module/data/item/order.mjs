import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Order items (ship orders/commands).
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class OrderData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Order category
      category: new fields.StringField({
        required: true,
        initial: "combat",
        choices: ["combat", "maneuver", "command", "support", "special"]
      }),
      
      // Action type
      actionType: new fields.StringField({
        required: true,
        initial: "extended-action",
        choices: ["extended-action", "reaction", "shooting-action", "maneuver-action"]
      }),
      
      // Required test
      test: new fields.SchemaField({
        skill: new fields.StringField({ required: true, initial: "command" }),
        characteristic: new fields.StringField({ required: false, blank: true }),
        modifier: new fields.NumberField({ required: true, initial: 0, integer: true })
      }),
      
      // Requirements
      requirements: new fields.HTMLField({ required: false, blank: true }),
      
      // Effect on success
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Failure consequences
      failure: new fields.HTMLField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get isRollable() {
    return true;
  }

  /**
   * Get the category label.
   * @type {string}
   */
  get categoryLabel() {
    return game.i18n.localize(`RT.OrderCategory.${this.category.capitalize()}`);
  }

  /**
   * Get the action type label.
   * @type {string}
   */
  get actionTypeLabel() {
    return game.i18n.localize(`RT.ActionType.${this.actionType.split("-").map(s => s.capitalize()).join("")}`);
  }

  /**
   * Get the test description.
   * @type {string}
   */
  get testLabel() {
    let label = this.test.skill;
    if ( this.test.modifier !== 0 ) {
      label += ` ${this.test.modifier >= 0 ? "+" : ""}${this.test.modifier}`;
    }
    return label;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.categoryLabel,
      this.actionTypeLabel,
      `Test: ${this.testLabel}`
    ];
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      category: this.categoryLabel,
      action: this.actionTypeLabel,
      test: this.testLabel
    };
  }
}
