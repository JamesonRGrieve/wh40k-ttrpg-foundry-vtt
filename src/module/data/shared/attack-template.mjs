import SystemDataModel from "../abstract/system-data-model.mjs";
import FormulaField from "../fields/formula-field.mjs";

/**
 * Template for items with attack capabilities.
 * @mixin
 */
export default class AttackTemplate extends SystemDataModel {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      attack: new fields.SchemaField({
        type: new fields.StringField({
          required: true,
          initial: "melee",
          choices: ["melee", "ranged", "thrown", "psychic"]
        }),
        characteristic: new fields.StringField({
          required: true,
          initial: "weaponSkill",
          choices: ["weaponSkill", "ballisticSkill", "willpower", "perception"]
        }),
        modifier: new fields.NumberField({ required: true, initial: 0, integer: true }),
        range: new fields.SchemaField({
          value: new fields.NumberField({ required: false, initial: 0, min: 0 }),
          units: new fields.StringField({ required: false, initial: "m" }),
          special: new fields.StringField({ required: false, blank: true })
        }),
        rateOfFire: new fields.SchemaField({
          single: new fields.BooleanField({ required: true, initial: true }),
          semi: new fields.NumberField({ required: true, initial: 0, min: 0 }),
          full: new fields.NumberField({ required: true, initial: 0, min: 0 })
        })
      })
    };
  }

  /* -------------------------------------------- */

  /**
   * Is this a melee attack?
   * @type {boolean}
   */
  get isMelee() {
    return this.attack.type === "melee";
  }

  /**
   * Is this a ranged attack?
   * @type {boolean}
   */
  get isRanged() {
    return this.attack.type === "ranged" || this.attack.type === "thrown";
  }

  /**
   * Is this a psychic attack?
   * @type {boolean}
   */
  get isPsychic() {
    return this.attack.type === "psychic";
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted rate of fire string.
   * @type {string}
   */
  get rateOfFireLabel() {
    const rof = this.attack.rateOfFire;
    const parts = [];
    parts.push(rof.single ? "S" : "-");
    parts.push(rof.semi > 0 ? rof.semi.toString() : "-");
    parts.push(rof.full > 0 ? rof.full.toString() : "-");
    return parts.join("/");
  }

  /* -------------------------------------------- */

  /**
   * Get a formatted range string.
   * @type {string}
   */
  get rangeLabel() {
    const range = this.attack.range;
    if ( range.special ) return range.special;
    if ( range.value ) return `${range.value}${range.units}`;
    return "-";
  }

  /* -------------------------------------------- */

  /**
   * Properties for chat display.
   * @type {string[]}
   */
  get chatProperties() {
    const props = [];
    if ( this.isRanged ) {
      props.push(`Range: ${this.rangeLabel}`);
      props.push(`RoF: ${this.rateOfFireLabel}`);
    }
    return props;
  }
}
