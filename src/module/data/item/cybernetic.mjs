import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import EquippableTemplate from "../shared/equippable-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Cybernetic items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes ModifiersTemplate
 */
export default class CyberneticData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  EquippableTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Cybernetic type
      type: new fields.StringField({
        required: true,
        initial: "replacement",
        choices: [
          "replacement", "implant", "augmetic", "bionic",
          "mechadendrite", "integrated-weapon"
        ]
      }),
      
      // Body location(s) affected
      locations: new fields.SetField(
        new fields.StringField({
          required: true,
          choices: [
            "head", "eyes", "ears", "mouth", "brain",
            "leftArm", "rightArm", "body", "organs",
            "leftLeg", "rightLeg", "spine", "internal"
          ]
        }),
        { required: true, initial: [] }
      ),
      
      // Provides armour points?
      hasArmourPoints: new fields.BooleanField({ required: true, initial: false }),
      armourPoints: new fields.SchemaField({
        head: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        leftArm: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        rightArm: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        body: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        leftLeg: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        rightLeg: new fields.NumberField({ required: true, initial: 0, min: 0 })
      }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Drawbacks
      drawbacks: new fields.HTMLField({ required: false, blank: true }),
      
      // Installation requirements
      installation: new fields.SchemaField({
        surgery: new fields.StringField({ required: false, blank: true }),
        difficulty: new fields.StringField({ required: false, blank: true }),
        recoveryTime: new fields.StringField({ required: false, blank: true })
      }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the cybernetic type label.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(`RT.CyberneticType.${this.type.split("-").map(s => s.capitalize()).join("")}`);
  }

  /**
   * Get the locations label.
   * @type {string}
   */
  get locationsLabel() {
    if ( !this.locations.size ) return "-";
    return Array.from(this.locations)
      .map(l => game.i18n.localize(`RT.BodyLocation.${l.capitalize()}`))
      .join(", ");
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this),
      this.typeLabel,
      `Location: ${this.locationsLabel}`
    ];
    
    if ( this.hasArmourPoints ) {
      const apValues = Object.entries(this.armourPoints)
        .filter(([_, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`);
      if ( apValues.length ) {
        props.push(`AP: ${apValues.join(", ")}`);
      }
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      type: this.typeLabel,
      location: this.locationsLabel
    };
  }
}
