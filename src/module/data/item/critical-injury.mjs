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
    const key = `RT.DamageType.${this.damageType.capitalize()}`;
    return game.i18n.has(key) ? game.i18n.localize(key) : this.damageType.capitalize();
  }

  /**
   * Get the body part label.
   * @type {string}
   */
  get bodyPartLabel() {
    const key = `RT.BodyPart.${this.bodyPart.capitalize()}`;
    return game.i18n.has(key) ? game.i18n.localize(key) : this.bodyPart.capitalize();
  }

  /**
   * Get the severity label.
   * @type {string}
   */
  get severityLabel() {
    const key = "RT.CriticalInjury.Severity";
    const label = game.i18n.has(key) ? game.i18n.localize(key) : "Severity";
    return `${label}: ${this.severity}`;
  }

  /**
   * Get icon for damage type.
   * @type {string}
   */
  get damageTypeIcon() {
    const icons = {
      impact: "fa-hammer",
      rending: "fa-cut",
      explosive: "fa-bomb",
      energy: "fa-bolt"
    };
    return icons[this.damageType] || "fa-band-aid";
  }

  /**
   * Get icon for body part.
   * @type {string}
   */
  get bodyPartIcon() {
    const icons = {
      head: "fa-head-side-brain",
      arm: "fa-hand-paper",
      body: "fa-user",
      leg: "fa-shoe-prints"
    };
    return icons[this.bodyPart] || "fa-user";
  }

  /**
   * Get CSS class for severity level.
   * @type {string}
   */
  get severityClass() {
    if (this.severity <= 3) return "severity-minor";
    if (this.severity <= 6) return "severity-moderate";
    if (this.severity <= 9) return "severity-severe";
    return "severity-fatal";
  }

  /**
   * Get full injury description (combines effect + notes).
   * @type {string}
   */
  get fullDescription() {
    let desc = this.effect || "";
    if (this.notes) {
      desc += desc ? `\n\n<strong>Notes:</strong> ${this.notes}` : this.notes;
    }
    return desc;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      this.damageTypeLabel,
      this.bodyPartLabel,
      this.severityLabel
    ];
    
    if ( this.permanent ) {
      const key = "RT.CriticalInjury.Permanent";
      props.push(game.i18n.has(key) ? game.i18n.localize(key) : "Permanent");
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
      severity: `${this.severity}/10`
    };
  }
}
