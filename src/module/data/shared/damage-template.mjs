import SystemDataModel from "../abstract/system-data-model.mjs";
import FormulaField from "../fields/formula-field.mjs";

/**
 * Template for items that deal damage.
 * @mixin
 */
export default class DamageTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      damage: new fields.SchemaField({
        formula: new FormulaField({ required: true, blank: true, initial: "" }),
        type: new fields.StringField({
          required: true,
          initial: "impact",
          choices: [
            "impact", "rending", "explosive", "energy", 
            "fire", "shock", "cold", "toxic"
          ]
        }),
        bonus: new fields.NumberField({ required: true, initial: 0, integer: true }),
        penetration: new fields.NumberField({ required: true, initial: 0, integer: true, min: 0 })
      }),
      special: new fields.SetField(
        new fields.StringField({ required: true }),
        { required: true, initial: new Set() }
      )
    };
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted damage string.
   * @type {string}
   */
  get damageLabel() {
    const dmg = this.damage;
    if ( !dmg.formula ) return "-";
    
    let label = dmg.formula;
    if ( dmg.bonus > 0 ) label += `+${dmg.bonus}`;
    else if ( dmg.bonus < 0 ) label += dmg.bonus.toString();
    
    return `${label} ${this.damageTypeAbbr}`;
  }

  /* -------------------------------------------- */

  /**
   * Get the damage type abbreviation.
   * @type {string}
   */
  get damageTypeAbbr() {
    const abbrs = {
      impact: "I",
      rending: "R",
      explosive: "X",
      energy: "E",
      fire: "F",
      shock: "S",
      cold: "C",
      toxic: "T"
    };
    return abbrs[this.damage.type] ?? this.damage.type.charAt(0).toUpperCase();
  }

  /* -------------------------------------------- */

  /**
   * Get localized damage type label.
   * @type {string}
   */
  get damageTypeLabel() {
    return game.i18n.localize(`RT.DamageType.${this.damage.type.capitalize()}`);
  }

  /* -------------------------------------------- */

  /**
   * Properties for chat display.
   * @type {string[]}
   */
  get chatProperties() {
    const props = [];
    if ( this.damage.formula ) {
      props.push(`Damage: ${this.damageLabel}`);
      props.push(`Pen: ${this.damage.penetration}`);
    }
    if ( this.special?.size ) {
      props.push(`Special: ${Array.from(this.special).join(", ")}`);
    }
    return props;
  }

  /* -------------------------------------------- */

  /**
   * Check if this has a specific special quality.
   * @param {string} quality   The quality to check.
   * @returns {boolean}
   */
  hasSpecial(quality) {
    return this.special?.has(quality.toLowerCase()) ?? false;
  }
}
