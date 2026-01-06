import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ActivationTemplate from "../shared/activation-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Ritual items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 */
export default class RitualData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ActivationTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Ritual type
      type: new fields.StringField({
        required: true,
        initial: "prayer",
        choices: ["prayer", "rite", "invocation", "ceremony", "tech-rite"]
      }),
      
      // Required test
      test: new fields.SchemaField({
        characteristic: new fields.StringField({
          required: true,
          initial: "willpower"
        }),
        skill: new fields.StringField({ required: false, blank: true }),
        modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
        threshold: new fields.NumberField({ required: false, initial: null })
      }),
      
      // Requirements
      requirements: new fields.HTMLField({ required: false, blank: true }),
      
      // Success effect
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Failure consequences
      failure: new fields.HTMLField({ required: false, blank: true }),
      
      // Costs (materials, time, etc.)
      costs: new fields.HTMLField({ required: false, blank: true }),
      
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
   * Get the ritual type label.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(`RT.RitualType.${this.type.split("-").map(s => s.capitalize()).join("")}`);
  }

  /**
   * Get the test description.
   * @type {string}
   */
  get testLabel() {
    let label = game.i18n.localize(`RT.Characteristic.${this.test.characteristic.capitalize()}`);
    if ( this.test.skill ) label = this.test.skill;
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
      this.typeLabel,
      `Test: ${this.testLabel}`,
      ...ActivationTemplate.prototype.chatProperties.call(this)
    ];
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      type: this.typeLabel,
      test: this.testLabel,
      action: this.activationLabel
    };
  }
}
