import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ActivationTemplate from "../shared/activation-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Navigator Power items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ActivationTemplate
 */
export default class NavigatorPowerData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ActivationTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Power test configuration
      test: new fields.SchemaField({
        characteristic: new fields.StringField({
          required: true,
          initial: "perception",
          choices: ["perception", "willpower"]
        }),
        modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
        opposed: new fields.BooleanField({ required: true, initial: false }),
        opposedCharacteristic: new fields.StringField({ required: false, blank: true })
      }),
      
      // Power levels (novice/adept/master)
      levels: new fields.SchemaField({
        novice: new fields.SchemaField({
          effect: new fields.HTMLField({ required: true, blank: true }),
          prerequisite: new fields.StringField({ required: false, blank: true })
        }),
        adept: new fields.SchemaField({
          effect: new fields.HTMLField({ required: true, blank: true }),
          prerequisite: new fields.StringField({ required: false, blank: true })
        }),
        master: new fields.SchemaField({
          effect: new fields.HTMLField({ required: true, blank: true }),
          prerequisite: new fields.StringField({ required: false, blank: true })
        })
      }),
      
      // Sustain description
      sustain: new fields.HTMLField({ required: false, blank: true }),
      
      // Side effects
      sideEffects: new fields.HTMLField({ required: false, blank: true }),
      
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
   * Get the test characteristic label.
   * @type {string}
   */
  get testCharacteristicLabel() {
    return game.i18n.localize(`RT.Characteristic.${this.test.characteristic.capitalize()}`);
  }

  /**
   * Get the test description.
   * @type {string}
   */
  get testLabel() {
    let label = this.testCharacteristicLabel;
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
      test: this.testLabel,
      action: this.activationLabel
    };
  }
}
