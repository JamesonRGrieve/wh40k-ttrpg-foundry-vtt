import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Critical Injury items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 */
export default class CriticalInjuryData extends ItemDataModel.mixin(
  DescriptionTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Damage type that caused this
      damageType: new fields.StringField({
        required: true,
        initial: "impact",
        choices: ["impact", "rending", "explosive", "energy"]
      }),
      
      // Body part affected
      bodyPart: new fields.StringField({
        required: true,
        initial: "body",
        choices: ["head", "arm", "body", "leg"]
      }),
      
      // Critical damage value (1-10+)
      severity: new fields.NumberField({ required: true, initial: 1, min: 1, integer: true }),
      
      // Effect description
      effect: new fields.HTMLField({ required: true, blank: true }),
      
      // Is this injury permanent?
      permanent: new fields.BooleanField({ required: true, initial: false }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Get the damage type label.
   * @type {string}
   */
  get damageTypeLabel() {
    return game.i18n.localize(`RT.DamageType.${this.damageType.capitalize()}`);
  }

  /**
   * Get the body part label.
   * @type {string}
   */
  get bodyPartLabel() {
    return game.i18n.localize(`RT.BodyPart.${this.bodyPart.capitalize()}`);
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.damageTypeLabel,
      this.bodyPartLabel,
      `Severity: ${this.severity}`
    ];
    
    if ( this.permanent ) {
      props.push(game.i18n.localize("RT.CriticalInjury.Permanent"));
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      type: this.damageTypeLabel,
      location: this.bodyPartLabel,
      severity: this.severity
    };
  }
}
